<?php
// CachyMusic - Dedicated High-Performance Cover Artwork Endpoint
// Serves embedded album artwork and lightweight thumbnails with persistent disk & HTTP caching

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

require_once(__DIR__ . '/../platform.php');
cachy_send_local_cors('GET, OPTIONS');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$cacheDir = cachy_cache_dir() . DIRECTORY_SEPARATOR . 'covers';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0775, true);
}

$tid = isset($_GET['tid']) ? (int)$_GET['tid'] : 0;
$path = $_GET['path'] ?? '';
$isThumb = isset($_GET['thumb']) && $_GET['thumb'] !== '0' && $_GET['thumb'] !== 'false';

function cachy_send_cached_file($filePath, $mime, $etag) {
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        http_response_code(304);
        exit;
    }
    header("Content-Type: $mime");
    header("Cache-Control: public, max-age=31536000, immutable");
    header("ETag: $etag");
    header("Content-Length: " . filesize($filePath));
    readfile($filePath);
    exit;
}

function cachy_send_default_cover() {
    http_response_code(200);
    header('Content-Type: image/svg+xml; charset=UTF-8');
    header('Cache-Control: public, max-age=604800, stale-while-revalidate=2592000');
    readfile(__DIR__ . '/../../resources/images/default.svg');
    exit;
}

function cachy_build_thumb($srcFile, $dstFile) {
    if (file_exists($dstFile) && filesize($dstFile) > 0) return;
    $raw = @file_get_contents($srcFile);
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
                    @imagedestroy($img);
                    if (file_exists($dstFile) && filesize($dstFile) > 0) return;
                }
            }
            @imagedestroy($img);
        }
    }
    $thumbTool = cachy_find_binary('ffmpeg');
    if ($thumbTool) {
        cachy_run_args([$thumbTool, '-y', '-v', 'quiet', '-i', $srcFile, '-vf', 'scale=128:128:force_original_aspect_ratio=decrease', '-q:v', '3', '-f', 'image2', $dstFile]);
    }
}

function cachy_link_tid_cache($cacheDir, $tid, $cacheFull, $cacheMime, $cacheThumb) {
    if ($tid <= 0) return;
    if (file_exists($cacheFull) && !file_exists($cacheDir . '/tid_' . $tid . '.img')) @copy($cacheFull, $cacheDir . '/tid_' . $tid . '.img');
    if (file_exists($cacheMime) && !file_exists($cacheDir . '/tid_' . $tid . '.mime')) @copy($cacheMime, $cacheDir . '/tid_' . $tid . '.mime');
    if (file_exists($cacheThumb) && !file_exists($cacheDir . '/tid_' . $tid . '_thumb.jpg')) @copy($cacheThumb, $cacheDir . '/tid_' . $tid . '_thumb.jpg');
}

// FAST-PATH: Direct zero-database cache hit by Track ID (Sub-millisecond)
if ($tid > 0) {
    if (file_exists($cacheDir . '/tid_' . $tid . '.none')) {
        cachy_send_default_cover();
    }
    if ($isThumb) {
        $fastThumb = $cacheDir . '/tid_' . $tid . '_thumb.jpg';
        if (file_exists($fastThumb) && filesize($fastThumb) > 0) {
            cachy_send_cached_file($fastThumb, 'image/jpeg', '"tid-' . $tid . '-thumb-' . filemtime($fastThumb) . '"');
        }
    } else {
        $fastFull = $cacheDir . '/tid_' . $tid . '.img';
        $fastMime = $cacheDir . '/tid_' . $tid . '.mime';
        if (file_exists($fastFull) && filesize($fastFull) > 0) {
            $mime = (file_exists($fastMime) ? trim(file_get_contents($fastMime)) : null) ?: 'image/jpeg';
            cachy_send_cached_file($fastFull, $mime, '"tid-' . $tid . '-full-' . filemtime($fastFull) . '"');
        }
    }
}

// SLOW-PATH: Path resolution, sandbox check, and on-demand extraction
require_once(__DIR__ . '/../database.php');

$fullPath = '';
if ($tid > 0) {
    $fullPath = Storage::getTrackPath($tid) ?: '';
}

if (empty($fullPath) && !empty($path)) {
    $real = realpath($path);
    if ($real && is_file($real) && is_readable($real)) {
        $fullPath = $real;
    }
}

$projectRoot = realpath(__DIR__ . '/../../');
$allowedRoots = [realpath($projectRoot . '/downloads')];

$defaultDir = Storage::getDefaultDirectory();
if ($defaultDir && is_dir($defaultDir)) {
    $realDef = realpath($defaultDir);
    if ($realDef) $allowedRoots[] = $realDef;
}
$slskAcc = Storage::getSoulseekAccount();
if (!empty($slskAcc['downloads_dir'])) {
    $slskDown = realpath($slskAcc['downloads_dir']);
    if ($slskDown && is_dir($slskDown)) $allowedRoots[] = $slskDown;
}
if (!empty($slskAcc['shared_dir'])) {
    $slskShare = realpath($slskAcc['shared_dir']);
    if ($slskShare && is_dir($slskShare)) $allowedRoots[] = $slskShare;
}

$userHome = cachy_home_dir();
$allowedRoots[] = realpath(cachy_data_dir() . "/downloads");
if ($userHome) {
    foreach (['/Music/Main', '/Music', '/Downloads'] as $sub) {
        if (is_dir($userHome . $sub)) {
            $r = realpath($userHome . $sub);
            if ($r) $allowedRoots[] = $r;
        }
    }
}
$allowedRoots = array_values(array_unique(array_filter($allowedRoots)));

if (!empty($fullPath)) {
    $isPathAllowed = false;
    foreach ($allowedRoots as $root) {
        if ($root && cachy_path_within($fullPath, $root)) {
            $isPathAllowed = true;
            break;
        }
    }
    if (!$isPathAllowed) {
        http_response_code(403);
        exit('Access denied: unauthorized artwork path.');
    }
}

if (empty($fullPath) || !file_exists($fullPath)) {
    http_response_code(404);
    header('Content-Type: image/svg+xml');
    readfile(__DIR__ . '/../../resources/images/default.svg');
    exit;
}

$cacheHash = md5($fullPath . '_' . filemtime($fullPath));
$cacheFull = $cacheDir . '/' . $cacheHash . '.img';
$cacheThumb = $cacheDir . '/' . $cacheHash . '_thumb.jpg';
$cacheMime = $cacheDir . '/' . $cacheHash . '.mime';
$cacheNone = $cacheDir . '/' . $cacheHash . '.none';

if (file_exists($cacheNone)) {
    if ($tid > 0 && !file_exists($cacheDir . '/tid_' . $tid . '.none')) @touch($cacheDir . '/tid_' . $tid . '.none');
    cachy_send_default_cover();
}

if (file_exists($cacheFull) && filesize($cacheFull) > 0) {
    if ($isThumb) cachy_build_thumb($cacheFull, $cacheThumb);
    cachy_link_tid_cache($cacheDir, $tid, $cacheFull, $cacheMime, $cacheThumb);
    if ($isThumb && file_exists($cacheThumb) && filesize($cacheThumb) > 0) {
        cachy_send_cached_file($cacheThumb, 'image/jpeg', '"' . $cacheHash . '-thumb"');
    }
    $mime = (file_exists($cacheMime) ? trim(file_get_contents($cacheMime)) : null) ?: 'image/jpeg';
    cachy_send_cached_file($cacheFull, $mime, '"' . $cacheHash . '"');
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

// Fast pure-PHP binary extraction first (< 1ms); spawn ffmpeg only as fallback.
$imgBytes = extract_php_embedded_cover($fullPath);
if (!$imgBytes || strlen($imgBytes) <= 100) {
    $ffmpegBin = cachy_find_binary('ffmpeg');
    if ($ffmpegBin) {
        $imgBytes = cachy_run_args([$ffmpegBin, '-v', 'quiet', '-i', $fullPath, '-an', '-c:v', 'copy', '-f', 'image2', '-']);
    }
}

if ($imgBytes && strlen($imgBytes) > 100) {
    $mime = substr($imgBytes, 0, 8) === "\x89PNG\x0D\x0A\x1A\x0A" ? 'image/png' : 'image/jpeg';
    @file_put_contents($cacheFull, $imgBytes);
    @file_put_contents($cacheMime, $mime);
    if ($isThumb) cachy_build_thumb($cacheFull, $cacheThumb);
    cachy_link_tid_cache($cacheDir, $tid, $cacheFull, $cacheMime, $cacheThumb);

    if ($isThumb && file_exists($cacheThumb) && filesize($cacheThumb) > 0) {
        cachy_send_cached_file($cacheThumb, 'image/jpeg', '"' . $cacheHash . '-thumb"');
    }
    cachy_send_cached_file($cacheFull, $mime, '"' . $cacheHash . '"');
}

// Folder cover art fallback (cover.jpg, folder.jpg, album.jpg, etc.)
$trackDir = dirname($fullPath);
foreach (['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'album.jpg'] as $cc) {
    $candidate = $trackDir . '/' . $cc;
    if (file_exists($candidate) && is_readable($candidate)) {
        $cMime = strtolower(pathinfo($candidate, PATHINFO_EXTENSION)) === 'png' ? 'image/png' : 'image/jpeg';
        @copy($candidate, $cacheFull);
        @file_put_contents($cacheMime, $cMime);
        if ($isThumb) cachy_build_thumb($cacheFull, $cacheThumb);
        cachy_link_tid_cache($cacheDir, $tid, $cacheFull, $cacheMime, $cacheThumb);

        if ($isThumb && file_exists($cacheThumb) && filesize($cacheThumb) > 0) {
            cachy_send_cached_file($cacheThumb, 'image/jpeg', '"' . $cacheHash . '-thumb"');
        }
        cachy_send_cached_file($candidate, $cMime, '"' . $cacheHash . '"');
    }
}

// Negative cache sentinel prevents repeated container scans for coverless tracks.
@touch($cacheNone);
if ($tid > 0) @touch($cacheDir . '/tid_' . $tid . '.none');
cachy_send_default_cover();
