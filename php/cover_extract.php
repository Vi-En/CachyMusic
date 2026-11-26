<?php
require_once __DIR__.'/platform.php';
require_once __DIR__.'/cover_cache_budget.php';
function cachy_cover_image($bytes): ?array {
    if (!is_string($bytes) || strlen($bytes) > 10 * 1024 * 1024) return null;
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info['mime'], ['image/png', 'image/jpeg'], true) || $info[0] < 1 || $info[1] < 1 || $info[0] > 8192 || $info[1] > 8192 || $info[0] * $info[1] > 16000000) return null;
    return ['bytes'=>$bytes, 'mime'=>$info['mime'], 'width'=>$info[0], 'height'=>$info[1]];
}
function cachy_cover_read(string $file): ?array {
    if (!cm_cover_cache_stat($file)) return null;
    $h=@fopen($file,'rb');if (!$h) return null;
    try {return cm_regular_descriptor($h,$file)?cachy_cover_image(stream_get_contents($h,10*1024*1024+1)):null;}
    finally {fclose($h);}
}
function cachy_build_thumb($srcFile, $dstFile, ?Closure $checkpoint=null) {
    if ($checkpoint) $checkpoint();
    if (file_exists($dstFile) && filesize($dstFile) > 0) return;
    $image = cachy_cover_read($srcFile);
    if (!$image) return;
    $raw = $image['bytes'];
    if ($raw && function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
        $img = @imagecreatefromstring($raw);
        if ($img !== false) {
            $w = imagesx($img);
            $h = imagesy($img);
            if ($w > 0 && $h > 0) {
                $scale = min(1.0, 128.0 / max($w, $h));
                $tw = max(1, (int)round($w * $scale));
                $th = max(1, (int)round($h * $scale));
                $resized = ($tw < $w || $th < $h) && function_exists('imagescale') ? @imagescale($img, $tw, $th) : $img;
                if ($resized !== false) {
                    @imagejpeg($resized, $dstFile, 84);
                    if ($resized !== $img) @imagedestroy($resized);
                    if (file_exists($dstFile) && filesize($dstFile) > 0) { @imagedestroy($img); return; }
                }
            }
            @imagedestroy($img);
        }
    }
    $thumbTool = cachy_find_binary('ffmpeg');
    if ($thumbTool) {
        // Capture bounded bytes; FFmpeg never writes to an external stage.
        $encoded=cachy_run_args([$thumbTool, '-v', 'quiet', '-i', $srcFile, '-vf', 'scale=128:128:force_original_aspect_ratio=decrease', '-q:v', '3', '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2pipe', '-'],1048576,15.0,$checkpoint);
        if ($checkpoint) $checkpoint();
        $image=cachy_cover_image($encoded);
        if ($image&&$image['mime']==='image/jpeg'&&max($image['width'],$image['height'])<=128) @file_put_contents($dstFile,$image['bytes']);
    }
}

// Publish thumbnails only after a validated, bounded derivative exists.
function cachy_cover_thumb(string $source, string $target, ?Closure $checkpoint=null): ?array {
    $image = cachy_cover_read($target);
    if ($image && $image['mime'] === 'image/jpeg' && max($image['width'], $image['height']) <= 128) return $image;
    if (is_link($target) || is_link($source)) return null;
    $tmp = @tempnam(dirname($target), '.thumb-');
    if ($tmp === false) return null;
    try {
        if (realpath(dirname($tmp)) !== realpath(dirname($target))) return null;
        cachy_build_thumb($source, $tmp,$checkpoint);
        if ($checkpoint) $checkpoint();
        $image = cachy_cover_read($tmp);
        if (!$image || $image['mime'] !== 'image/jpeg' || max($image['width'], $image['height']) > 128) return null;
        cm_cover_cache_publish($target,$image['bytes']);
        return $image;
    } finally { if (is_file($tmp)) @unlink($tmp); }
}

function cachy_mp4_find_box($fh, $start, $limit, $target) {
    $pos = $start;
    for ($i = 0; $i < 256 && $pos + 8 <= $limit; $i++) {
        if (fseek($fh, $pos, SEEK_SET) !== 0) break;
        $hdr = fread($fh, 8);
        if (strlen($hdr) < 8) break;
        $size = unpack('N', substr($hdr, 0, 4))[1];
        $hdrLen = 8;
        if ($size === 1 && $pos + 16 <= $limit) {
            $ext = fread($fh, 8);
            if (strlen($ext) < 8) break;
            $parts = unpack('Nhi/Nlo', $ext);
            $size = ($parts['hi'] * 4294967296) + $parts['lo'];
            $hdrLen = 16;
        } elseif ($size === 0) {
            $size = $limit - $pos;
        }
        if ($size < $hdrLen || $pos + $size > $limit) break;
        if (substr($hdr, 4, 4) === $target) {
            return [$pos + $hdrLen, $pos + $size];
        }
        $pos += $size;
    }
    return null;
}

function extract_php_embedded_cover($audioPath) {
    $fh = @fopen($audioPath, 'rb');
    if (!$fh) return null;
    try {
        $head = fread($fh, 12);
        if (strlen($head) < 12) return null;
        $maxRead = 10485760;

        if (substr($head, 0, 4) === 'fLaC') {
            $pos = 4;
            for ($i = 0; $i < 256 && $pos < $maxRead; $i++) {
                if (fseek($fh, $pos, SEEK_SET) !== 0) break;
                $hdr = fread($fh, 4);
                if (strlen($hdr) < 4) break;
                $b0 = ord($hdr[0]);
                $last = ($b0 & 0x80) !== 0;
                $type = $b0 & 0x7F;
                $bLen = (ord($hdr[1]) << 16) | (ord($hdr[2]) << 8) | ord($hdr[3]);
                $pos += 4;
                if ($bLen <= 0 || $bLen > $maxRead) break;
                if ($type === 6 && $bLen > 32) {
                    $blk = fread($fh, $bLen);
                    if (strlen($blk) === $bLen) {
                        $mimeLen = unpack('N', substr($blk, 4, 4))[1];
                        $p = 8 + $mimeLen;
                        if ($p + 4 <= $bLen) {
                            $descLen = unpack('N', substr($blk, $p, 4))[1];
                            $p += 4 + $descLen + 16;
                            if ($p + 4 <= $bLen) {
                                $picLen = unpack('N', substr($blk, $p, 4))[1];
                                $p += 4;
                                if ($picLen > 16 && $p + $picLen <= $bLen) {
                                    return substr($blk, $p, $picLen);
                                }
                            }
                        }
                    }
                }
                $pos += $bLen;
                if ($last) break;
            }
            return null;
        }

        if (substr($head, 0, 3) === 'ID3') {
            $ver = ord($head[3]);
            $flags = ord($head[5]);
            $tagSize = ((ord($head[6]) & 0x7F) << 21) | ((ord($head[7]) & 0x7F) << 14) | ((ord($head[8]) & 0x7F) << 7) | (ord($head[9]) & 0x7F);
            $limit = 10 + min($tagSize, $maxRead);
            $pos = 10;
            if (($flags & 0x40) !== 0 && ($ver === 3 || $ver === 4) && $pos + 4 <= $limit) {
                fseek($fh, $pos, SEEK_SET);
                $ext = fread($fh, 4);
                if (strlen($ext) < 4) return null;
                $extSz = $ver >= 4
                    ? (((ord($ext[0]) & 0x7F) << 21) | ((ord($ext[1]) & 0x7F) << 14) | ((ord($ext[2]) & 0x7F) << 7) | (ord($ext[3]) & 0x7F))
                    : unpack('N', $ext)[1];
                $pos += 4 + ($ver >= 4 ? max(0, $extSz - 4) : $extSz);
            }
            $isV2 = ($ver === 2);
            $fHdrLen = $isV2 ? 6 : 10;
            while ($pos + $fHdrLen <= $limit) {
                if (fseek($fh, $pos, SEEK_SET) !== 0) break;
                $fHdr = fread($fh, $fHdrLen);
                if (strlen($fHdr) < $fHdrLen || $fHdr[0] === "\x00") break;
                $pos += $fHdrLen;
                if ($isV2) {
                    $isApic = substr($fHdr, 0, 3) === 'PIC';
                    $fSize = (ord($fHdr[3]) << 16) | (ord($fHdr[4]) << 8) | ord($fHdr[5]);
                } else {
                    $isApic = substr($fHdr, 0, 4) === 'APIC';
                    $syncSafe = $ver >= 4 && ((ord($fHdr[4]) | ord($fHdr[5]) | ord($fHdr[6]) | ord($fHdr[7])) & 0x80) === 0;
                    $fSize = $syncSafe
                        ? (((ord($fHdr[4]) & 0x7F) << 21) | ((ord($fHdr[5]) & 0x7F) << 14) | ((ord($fHdr[6]) & 0x7F) << 7) | (ord($fHdr[7]) & 0x7F))
                        : unpack('N', substr($fHdr, 4, 4))[1];
                }
                if ($fSize <= 0 || $pos + $fSize > $limit || $fSize > $maxRead) break;
                if ($isApic && $fSize > 16) {
                    $frame = fread($fh, $fSize);
                    if (strlen($frame) !== $fSize) break;
                    $enc = ord($frame[0]);
                    if ($isV2) {
                        $dStart = 5;
                    } else {
                        $nul = strpos($frame, "\x00", 1);
                        if ($nul === false) break;
                        $dStart = $nul + 2;
                    }
                    if ($dStart < $fSize) {
                        if ($enc === 1 || $enc === 2) {
                            while ($dStart + 1 < $fSize && !($frame[$dStart] === "\x00" && $frame[$dStart + 1] === "\x00")) {
                                $dStart += 2;
                            }
                            $dStart += 2;
                        } else {
                            while ($dStart < $fSize && $frame[$dStart] !== "\x00") {
                                $dStart++;
                            }
                            $dStart += 1;
                        }
                        if ($dStart < $fSize && ($fSize - $dStart) > 16) {
                            return substr($frame, $dStart);
                        }
                    }
                }
                $pos += $fSize;
            }
            return null;
        }

        if (substr($head, 4, 4) === 'ftyp') {
            $stat = fstat($fh);
            $fileSize = $stat ? (int)$stat['size'] : 0;
            if ($fileSize <= 12) return null;
            $moov = cachy_mp4_find_box($fh, 0, $fileSize, 'moov');
            if (!$moov) return null;
            $udta = cachy_mp4_find_box($fh, $moov[0], $moov[1], 'udta');
            if (!$udta) return null;
            $meta = cachy_mp4_find_box($fh, $udta[0], $udta[1], 'meta');
            if (!$meta || $meta[0] + 4 > $meta[1]) return null;
            $ilst = cachy_mp4_find_box($fh, $meta[0] + 4, $meta[1], 'ilst');
            if (!$ilst) return null;
            $covr = cachy_mp4_find_box($fh, $ilst[0], $ilst[1], 'covr');
            if (!$covr) return null;
            $data = cachy_mp4_find_box($fh, $covr[0], $covr[1], 'data');
            if (!$data || $data[0] + 8 >= $data[1]) return null;
            $picLen = $data[1] - ($data[0] + 8);
            if ($picLen <= 16 || $picLen > $maxRead) return null;
            if (fseek($fh, $data[0] + 8, SEEK_SET) !== 0) return null;
            $pic = fread($fh, $picLen);
            return strlen($pic) === $picLen ? $pic : null;
        }

        return null;
    } finally {
        fclose($fh);
    }
}

function cm_cover_identity(string $file): ?array {
    clearstatcache(true,$file);$s=@lstat($file);
    return $s&&($s['mode']&0170000)===0100000?[$s['dev'],$s['ino'],$s['size'],$s['mtime'],$s['ctime']]:null;
}
function cm_cover_source(string $fullPath): ?array {
    $version=cm_cover_identity($fullPath);if ($version===null) return null;
    $sidecars=[];
    foreach (['cover.jpg','cover.png','folder.jpg','folder.png','front.jpg','front.png','album.jpg'] as $name) {
        $candidate=dirname($fullPath).DIRECTORY_SEPARATOR.$name;$v=cm_cover_identity($candidate);
        if ($v!==null) $sidecars[$candidate]=$v;
    }
    return ['hash'=>hash('sha256',serialize([$fullPath,$version,$sidecars])),'sidecars'=>$sidecars];
}
function cm_cover_extract(string $fullPath,array $source,?Closure $checkpoint=null): ?array {
    if ($checkpoint) $checkpoint();
    $image=cachy_cover_image(extract_php_embedded_cover($fullPath));$transient=false;
    if (!$image) {
        $ffmpeg=cachy_find_binary('ffmpeg');
        if ($ffmpeg) {
            $result=cachy_run_process([$ffmpeg,'-v','quiet','-i',$fullPath,'-an','-frames:v','1','-c:v','copy','-f','image2','-'],10*1024*1024,15.0,null,$checkpoint);
            $transient=$result===null;
            if ($result!==null&&$result['exitcode']===0) $image=cachy_cover_image($result['stdout']);
        }
    }
    if ($checkpoint) $checkpoint();
    if (!$image) foreach($source['sidecars'] as $candidate=>$version) {
        if (cm_cover_identity($candidate)!==$version) continue;
        $image=cachy_cover_read($candidate);if ($image) break;
    }
    // Never publish a derivative under an obsolete source key.
    if (cm_cover_source($fullPath)!==$source) throw new RuntimeException('Artwork source changed');
    if (!$image&&$transient) throw new RuntimeException('Artwork extraction did not complete');
    return $image;
}
