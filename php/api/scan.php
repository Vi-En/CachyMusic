<?php
// CachyMusic - Ultra-Fast Audio Library Scanner & Metadata Engine
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
header('Content-Type: application/json; charset=utf-8');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once(__DIR__ . '/../database.php');

$scriptBase = basename($_SERVER['SCRIPT_FILENAME'] ?? '');
$isDirectScanRequest = ($scriptBase === 'scan.php' || $scriptBase === 'tracks.php');

if ($isDirectScanRequest) {
    $rawInput = file_get_contents('php://input');
    $json = json_decode($rawInput, true);

    $requestedDir = $json['directory'] ?? $_POST['directory'] ?? $_GET['directory'] ?? '';
    $requestedDir = trim($requestedDir);

    // 1. Determine directory to scan
    if (empty($requestedDir)) {
        $requestedDir = Storage::getDefaultDirectory();
    }

    $homeDir = getenv('HOME') ?: ($_SERVER['HOME'] ?? (getenv('USER') ? '/home/' . getenv('USER') : ''));

    // If no directory has been chosen yet, do not load placeholder tracks; prompt user to choose directory first
    if (empty($requestedDir)) {
        echo json_encode([
            'success'        => true,
            'directory'      => '',
            'count'          => 0,
            'tracks'         => [],
            'needsDirectory' => true
        ]);
        exit;
    }

    if (!empty($requestedDir) && (str_starts_with($requestedDir, '~') || str_starts_with($requestedDir, '~/'))) {
        $requestedDir = preg_replace('#^~(/|$)#', rtrim($homeDir, '/') . '$1', $requestedDir);
    }

    $realDir = realpath($requestedDir);
    if ($realDir === false || !is_dir($realDir) || !is_readable($realDir)) {
        $alt = realpath(__DIR__ . '/../../' . ltrim($requestedDir, '/'));
        if ($alt && is_dir($alt) && is_readable($alt)) {
            $realDir = $alt;
        }
    }
    if ($realDir === false || !is_dir($realDir) || !is_readable($realDir)) {
        echo json_encode([
            'success' => false,
            'message' => "Directory does not exist or is not readable: " . htmlspecialchars($requestedDir) . ". Please set a valid directory manually in Settings → Library & Folders."
        ]);
        exit;
    }

    // Security: Block system directories and enforce sandbox allowlist
    $projectRoot = realpath(__DIR__ . '/../../');
    $blockedSystemPrefixes = ['/etc', '/proc', '/sys', '/dev', '/root', '/boot', '/bin', '/sbin', '/usr', '/lib', '/lib64', '/var/log', '/var/lib'];
    $isBlocked = ($realDir === '/');
    if (!$isBlocked) {
        foreach ($blockedSystemPrefixes as $bPrefix) {
            if ($realDir === $bPrefix || str_starts_with($realDir, $bPrefix . '/')) {
                $isBlocked = true;
                break;
            }
        }
    }

    $allowedScanRoots = array_filter([
        $homeDir ? realpath($homeDir) : null,
        $projectRoot,
        '/mnt',
        '/media',
        '/run/media'
    ]);
    $isAllowedRoot = false;
    foreach ($allowedScanRoots as $aRoot) {
        if ($realDir === $aRoot || str_starts_with($realDir, rtrim($aRoot, '/') . '/')) {
            $isAllowedRoot = true;
            break;
        }
    }

    if ($isBlocked || !$isAllowedRoot) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => "Security restriction: Scanning system or unauthorized root directories is not permitted."
        ]);
        exit;
    }

    // 2. Persist to DefaultDirectory
    Storage::setDefaultDirectory($realDir);

    // 3. Load existing cached tracks for instant lookup
    $cachedTracks = Storage::getCachedTracks($realDir);

    // 4. Scan directory for audio files (with batching & recursion depth limits)
    $AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'wma'];
    $tracks = [];
    $MAX_TRACKS = 25000;

    try {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($realDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );
        $iterator->setMaxDepth(12);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => "Could not read directory."]);
        exit;
    }

    Storage::beginBatch();
    foreach ($iterator as $file) {
        if (count($tracks) >= $MAX_TRACKS) break;
        if (!$file->isFile()) continue;
        $ext = strtolower($file->getExtension());
        if (!in_array($ext, $AUDIO_EXTS, true)) continue;

        $fullPath = $file->getPathname();
        $filename = $file->getFilename();
        $fileSize = $file->getSize();
        $mtime = $file->getMTime();

        $tid = null;
        $meta = null;
        $hasCover = false;

        // Check cache: if path and mtime match, use cached metadata instantly (<0.01ms)
        if (isset($cachedTracks[$fullPath]) && (int)$cachedTracks[$fullPath]['mtime'] === (int)$mtime && !empty($cachedTracks[$fullPath]['duration'])) {
            $c = $cachedTracks[$fullPath];
            $tid = (int)$c['tid'];
            $hasCover = !empty($c['has_cover']);
            $cachedSr = $c['sample_rate'] ? (int)$c['sample_rate'] : null;
            $cachedFmt = $c['format'] ?: strtoupper($ext);
            $cachedBps = (!empty($c['bit_depth'])) ? (int)$c['bit_depth'] : (($cachedSr && $cachedSr >= 88200 && ($cachedFmt === 'FLAC' || $cachedFmt === 'WAV')) ? 24 : 16);
            $meta = [
                'title'      => $c['title'],
                'artist'     => $c['artist'],
                'album'      => $c['album'],
                'genre'      => $c['genre'],
                'year'       => $c['year'] ? (int)$c['year'] : null,
                'track'      => $c['track_num'],
                'duration'   => (float)$c['duration'],
                'bitrate'    => $c['bitrate'] ? (int)$c['bitrate'] : null,
                'sampleRate' => $cachedSr,
                'channels'   => $c['channels'] ? (int)$c['channels'] : 2,
                'bitDepth'   => $cachedBps,
                'codec'      => $cachedFmt,
                'lyrics'     => $c['lyrics'],
                'replayGain' => $c['replay_gain'] ?? null,
                'replayPeak' => $c['replay_peak'] ?? null,
                'hasCover'   => $hasCover
            ];
        } else {
            // Extract metadata from audio file
            $meta = extract_actual_audio_metadata($fullPath, $ext, $fileSize);
            $hasCover = !empty($meta['hasCover']);

            // Insert or update in storage (batched in memory, flushed once after loop)
            $tid = Storage::upsertTrack([
                'file_path'   => $fullPath,
                'full_path'   => $fullPath,
                'title'       => $meta['title'],
                'artist'      => $meta['artist'],
                'album'       => $meta['album'],
                'genre'       => $meta['genre'],
                'year'        => $meta['year'] ?: null,
                'track_num'   => $meta['track'],
                'duration'    => (float)($meta['duration'] ?: 0),
                'bitrate'     => $meta['bitrate'] ?: null,
                'sample_rate' => $meta['sampleRate'] ?: null,
                'channels'    => (int)($meta['channels'] ?: 2),
                'bit_depth'   => (int)($meta['bitDepth'] ?: 16),
                'format'      => strtoupper($meta['codec'] ?: $ext),
                'file_size'   => $fileSize,
                'mtime'       => $mtime,
                'has_cover'   => $hasCover ? 1 : 0,
                'lyrics'      => $meta['lyrics'] ?? null,
                'replay_gain' => $meta['replayGain'] ?? null,
                'replay_peak' => $meta['replayPeak'] ?? null
            ]);
        }

        $tracks[] = [
            'id'          => $tid ?: $filename,
            'tid'         => $tid,
            'filename'    => $filename,
            'fullPath'    => $fullPath,
            'title'       => $meta['title'],
            'artist'      => $meta['artist'],
            'album'       => $meta['album'],
            'genre'       => $meta['genre'],
            'year'        => $meta['year'],
            'track'       => $meta['track'],
            'duration'    => $meta['duration'],
            'bitrate'     => $meta['bitrate'],
            'sampleRate'  => $meta['sampleRate'],
            'channels'    => $meta['channels'],
            'bitDepth'    => $meta['bitDepth'] ?? ((!empty($meta['sampleRate']) && $meta['sampleRate'] >= 88200) ? 24 : 16),
            'format'      => strtoupper($meta['codec'] ?: $ext),
            'size'        => format_filesize($fileSize),
            'cover'       => $hasCover ? ('php/api/cover.php?tid=' . ($tid ?: urlencode($fullPath))) : null,
            'hasCover'    => $hasCover,
            'lyrics'      => $meta['lyrics'] ?? null,
            'replayGain'  => $meta['replayGain'] ?? null,
            'replayPeak'  => $meta['replayPeak'] ?? null,
            'src'         => 'php/api/stream.php?path=' . urlencode($fullPath)
        ];
    }
    Storage::commitBatch();

    echo json_encode([
        'success'   => true,
        'directory' => $realDir,
        'count'     => count($tracks),
        'tracks'    => $tracks
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

/* ========================================================================= */
/* Comprehensive Audio Metadata Extractor                                    */
/* Reads actual inside tags via ffprobe with pure PHP fallback               */
/* ========================================================================= */

function normalize_id3_genre($g) {
    if (!$g) return null;
    static $genres = [
        0 => 'Blues', 1 => 'Classic Rock', 2 => 'Country', 3 => 'Dance', 4 => 'Disco', 5 => 'Funk',
        6 => 'Grunge', 7 => 'Hip-Hop', 8 => 'Jazz', 9 => 'Metal', 10 => 'New Age', 11 => 'Oldies',
        12 => 'Other', 13 => 'Pop', 14 => 'R&B', 15 => 'Rap', 16 => 'Reggae', 17 => 'Rock',
        18 => 'Techno', 19 => 'Industrial', 20 => 'Alternative', 21 => 'Ska', 22 => 'Death Metal',
        23 => 'Pranks', 24 => 'Soundtrack', 25 => 'Euro-Techno', 26 => 'Ambient', 27 => 'Trip-Hop',
        28 => 'Vocal', 29 => 'Jazz+Funk', 30 => 'Fusion', 31 => 'Trance', 32 => 'Classical',
        33 => 'Instrumental', 34 => 'Acid', 35 => 'House', 36 => 'Game', 37 => 'Sound Clip',
        38 => 'Gospel', 39 => 'Noise', 40 => 'AlternRock', 41 => 'Bass', 42 => 'Soul',
        43 => 'Punk', 44 => 'Space', 45 => 'Meditative', 46 => 'Instrumental Pop',
        47 => 'Instrumental Rock', 48 => 'Ethnic', 49 => 'Gothic', 50 => 'Darkwave',
        51 => 'Techno-Industrial', 52 => 'Electronic', 53 => 'Pop-Folk', 54 => 'Eurodance',
        55 => 'Dream', 56 => 'Southern Rock', 57 => 'Comedy', 58 => 'Cult', 59 => 'Gangsta',
        60 => 'Top 40', 61 => 'Christian Rap', 62 => 'Pop/Funk', 63 => 'Jungle',
        64 => 'Native American', 65 => 'Cabaret', 66 => 'New Wave', 67 => 'Psychadelic',
        68 => 'Rave', 69 => 'Showtunes', 70 => 'Trailer', 71 => 'Lo-Fi', 72 => 'Tribal',
        73 => 'Acid Punk', 74 => 'Acid Jazz', 75 => 'Polka', 76 => 'Retro', 77 => 'Musical',
        78 => 'Rock & Roll', 79 => 'Hard Rock'
    ];
    $g = trim((string)$g);
    if (preg_match('/^\(?(\d+)\)?$/', $g, $m)) {
        $idx = (int)$m[1];
        if (isset($genres[$idx])) return $genres[$idx];
    }
    if (preg_match('/^\((\d+)\)\s*(.*)$/', $g, $m)) {
        $idx = (int)$m[1];
        $rest = trim($m[2]);
        $name = $genres[$idx] ?? '';
        return $name ? ($rest ? "$name $rest" : $name) : ($rest ?: $g);
    }
    return $g;
}

function extract_actual_audio_metadata($path, $ext, $fileSize) {
    $result = [
        'title'      => null,
        'artist'     => null,
        'album'      => null,
        'genre'      => null,
        'year'       => null,
        'track'      => null,
        'duration'   => null,
        'bitrate'    => null,
        'sampleRate' => null,
        'channels'   => null,
        'codec'      => strtoupper($ext),
        'cover'      => null,
        'hasCover'   => false,
        'lyrics'     => null
    ];

    // Check for sidecar .lrc or .txt lyrics file in the same folder
    $dirName = dirname($path);
    $baseName = pathinfo($path, PATHINFO_FILENAME);
    $lrcFile = $dirName . '/' . $baseName . '.lrc';
    $txtLyrics = $dirName . '/' . $baseName . '.lyrics';
    if (file_exists($lrcFile) && is_readable($lrcFile)) {
        $result['lyrics'] = @file_get_contents($lrcFile);
    } elseif (file_exists($txtLyrics) && is_readable($txtLyrics)) {
        $result['lyrics'] = @file_get_contents($txtLyrics);
    }

    // Check for folder cover art
    $commonCovers = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'album.jpg'];
    foreach ($commonCovers as $cc) {
        if (file_exists($dirName . '/' . $cc)) {
            $result['hasCover'] = true;
            break;
        }
    }

    // Method 1: Use ffprobe if available
    $hasFfprobe = false;
    $probeOut = @shell_exec("ffprobe -v quiet -print_format json -show_format -show_streams " . escapeshellarg($path) . " 2>/dev/null");
    if ($probeOut && strlen($probeOut) > 10) {
        $probeData = json_decode($probeOut, true);
        if ($probeData && (isset($probeData['format']) || isset($probeData['streams']))) {
            $hasFfprobe = true;
            parse_ffprobe_data($probeData, $path, $result);
        }
    }

    // Method 2: Fallback pure PHP ID3/FLAC parser if ffprobe not available
    if (!$hasFfprobe || ($result['title'] === null && $result['artist'] === null)) {
        if ($ext === 'mp3') {
            $phpTags = read_php_id3_tags($path);
            foreach (['title', 'artist', 'album', 'genre', 'year', 'track', 'lyrics'] as $key) {
                if ($result[$key] === null && !empty($phpTags[$key])) {
                    $result[$key] = $phpTags[$key];
                }
            }
            if (!empty($phpTags['hasCover'])) $result['hasCover'] = true;
        } elseif ($ext === 'flac') {
            $phpTags = read_php_flac_tags($path, $fileSize);
            foreach (['title', 'artist', 'album', 'genre', 'year', 'track', 'duration', 'bitrate', 'sampleRate', 'channels', 'bitDepth', 'lyrics'] as $key) {
                if ($result[$key] === null && !empty($phpTags[$key])) {
                    $result[$key] = $phpTags[$key];
                }
            }
            if (!empty($phpTags['hasCover'])) $result['hasCover'] = true;
        }
    }

    // Fallback duration estimate from filesize and bitrate if still unknown
    if ($result['duration'] === null && $result['bitrate'] !== null && $result['bitrate'] > 0) {
        $bytesPerSec = ($result['bitrate'] * 1000) / 8;
        $result['duration'] = round($fileSize / $bytesPerSec, 2);
    }

    return $result;
}

function parse_ffprobe_data($data, $path, &$out) {
    $format = $data['format'] ?? [];
    $streams = $data['streams'] ?? [];

    $audioStream = null;
    foreach ($streams as $s) {
        if (($s['codec_type'] ?? '') === 'audio' && !$audioStream) {
            $audioStream = $s;
        }
        if (($s['codec_type'] ?? '') === 'video' || ($s['disposition']['attached_pic'] ?? 0) === 1) {
            $out['hasCover'] = true;
        }
    }

    // Combine format tags + audio stream tags
    $rawTags = array_merge($format['tags'] ?? [], $audioStream['tags'] ?? []);
    $tags = [];
    foreach ($rawTags as $k => $v) {
        $tags[strtolower($k)] = is_string($v) ? trim($v) : $v;
    }

    if (!empty($tags['title'])) $out['title'] = $tags['title'];
    if (!empty($tags['artist'])) $out['artist'] = $tags['artist'];
    elseif (!empty($tags['album_artist'])) $out['artist'] = $tags['album_artist'];
    elseif (!empty($tags['performer'])) $out['artist'] = $tags['performer'];
    elseif (!empty($tags['composer'])) $out['artist'] = $tags['composer'];

    if (!empty($tags['album'])) $out['album'] = $tags['album'];
    if (!empty($tags['genre'])) $out['genre'] = normalize_id3_genre($tags['genre']);

    $dateVal = $tags['date'] ?? $tags['year'] ?? $tags['tyer'] ?? $tags['tdrc'] ?? null;
    if ($dateVal && preg_match('/(\d{4})/', $dateVal, $m)) {
        $out['year'] = (int)$m[1];
    }

    if (!empty($tags['track'])) {
        $out['track'] = preg_replace('/\/\d+$/', '', $tags['track']);
    }

    if (!empty($format['duration']) && (float)$format['duration'] > 0) {
        $out['duration'] = round((float)$format['duration'], 2);
    } elseif ($audioStream && !empty($audioStream['duration']) && (float)$audioStream['duration'] > 0) {
        $out['duration'] = round((float)$audioStream['duration'], 2);
    }

    if ($audioStream && !empty($audioStream['bit_rate']) && (int)$audioStream['bit_rate'] > 0) {
        $out['bitrate'] = (int)round((int)$audioStream['bit_rate'] / 1000);
    } elseif (!empty($format['bit_rate']) && (int)$format['bit_rate'] > 0) {
        $out['bitrate'] = (int)round((int)$format['bit_rate'] / 1000);
    }

    if ($audioStream && !empty($audioStream['sample_rate'])) {
        $out['sampleRate'] = (int)$audioStream['sample_rate'];
    }

    if ($audioStream && !empty($audioStream['channels'])) {
        $out['channels'] = (int)$audioStream['channels'];
    }

    if ($audioStream && !empty($audioStream['codec_name'])) {
        $out['codec'] = strtoupper($audioStream['codec_name']);
    }

    // Extract bit depth (e.g. 24-bit, 32-bit, 16-bit)
    $bitDepth = null;
    if ($audioStream && !empty($audioStream['bits_per_raw_sample'])) {
        $bitDepth = (int)$audioStream['bits_per_raw_sample'];
    } elseif ($audioStream && !empty($audioStream['bits_per_sample'])) {
        $bitDepth = (int)$audioStream['bits_per_sample'];
    } elseif ($audioStream && !empty($audioStream['sample_fmt'])) {
        if (strpos($audioStream['sample_fmt'], 's32') !== false || strpos($audioStream['sample_fmt'], 'flt') !== false) {
            $bitDepth = 24;
        } elseif (strpos($audioStream['sample_fmt'], 's16') !== false) {
            $bitDepth = 16;
        }
    }
    if (!$bitDepth && strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'flac' && !empty($out['sampleRate']) && $out['sampleRate'] >= 88200) {
        $bitDepth = 24;
    }
    $out['bitDepth'] = $bitDepth ?: 16;

    if (empty($out['lyrics'])) {
        $lyricTag = $tags['lyrics'] ?? $tags['unsyncedlyrics'] ?? $tags['lyrics-eng'] ?? $tags['uslt'] ?? $tags['text'] ?? null;
        if (!empty($lyricTag)) {
            $out['lyrics'] = $lyricTag;
        }
    }

    // Extract ReplayGain / EBU R128 loudness normalization tags
    $gainStr = $tags['replaygain_track_gain'] ?? $tags['r128_track_gain'] ?? $tags['replaygain_album_gain'] ?? null;
    if ($gainStr !== null && preg_match('/([-+]?\d+(?:\.\d+)?)/', $gainStr, $gm)) {
        $out['replayGain'] = (float)$gm[1];
    }
    $peakStr = $tags['replaygain_track_peak'] ?? $tags['replaygain_album_peak'] ?? null;
    if ($peakStr !== null && is_numeric($peakStr)) {
        $out['replayPeak'] = (float)$peakStr;
    }
}

/* ========================================================================= */
/* Pure PHP ID3 / FLAC Fallback Parsers                                      */
/* ========================================================================= */

function read_php_id3_tags($path) {
    $out = ['title' => null, 'artist' => null, 'album' => null, 'genre' => null, 'year' => null, 'track' => null, 'hasCover' => false, 'lyrics' => null];
    $fh = @fopen($path, 'rb');
    if (!$fh) return $out;

    $header = fread($fh, 10);
    if (strlen($header) === 10 && substr($header, 0, 3) === 'ID3') {
        $version = ord($header[3]);
        $tagSize = synchsafe_to_int(substr($header, 6, 4));
        if ($tagSize > 0) {
            $readLen = min($tagSize, 10485760);
            $body = fread($fh, $readLen);
            if ($body !== false && strlen($body) > 0) {
                parse_id3v2_frames($body, $version, $out);
            }
        }
    }

    fseek($fh, -128, SEEK_END);
    $tail = fread($fh, 128);
    if (strlen($tail) === 128 && substr($tail, 0, 3) === 'TAG') {
        if ($out['title'] === null) {
            $t = trim(str_replace("\0", '', substr($tail, 3, 30)));
            if ($t !== '') $out['title'] = $t;
        }
        if ($out['artist'] === null) {
            $a = trim(str_replace("\0", '', substr($tail, 33, 30)));
            if ($a !== '') $out['artist'] = $a;
        }
        if ($out['album'] === null) {
            $al = trim(str_replace("\0", '', substr($tail, 63, 30)));
            if ($al !== '') $out['album'] = $al;
        }
        if ($out['year'] === null) {
            $y = (int)trim(str_replace("\0", '', substr($tail, 93, 4)));
            if ($y > 1900 && $y < 2100) $out['year'] = $y;
        }
    }

    fclose($fh);
    return $out;
}

function synchsafe_to_int($bytes) {
    return (ord($bytes[0]) << 21) | (ord($bytes[1]) << 14) | (ord($bytes[2]) << 7) | ord($bytes[3]);
}

function parse_id3v2_frames($body, $version, &$out) {
    $len = strlen($body);
    $pos = 0;

    while ($pos + 10 <= $len) {
        $frameId = substr($body, $pos, 4);
        if ($frameId === "\0\0\0\0" || trim($frameId) === '') break;

        $sizeBytes = substr($body, $pos + 4, 4);
        $frameSize = ($version >= 4) ? synchsafe_to_int($sizeBytes) : unpack('N', $sizeBytes)[1];
        $pos += 10;
        if ($frameSize <= 0 || $pos + $frameSize > $len) break;

        $data = substr($body, $pos, $frameSize);
        $pos += $frameSize;

        switch ($frameId) {
            case 'TIT2':
                $v = decode_id3_text($data);
                if ($v !== '') $out['title'] = $v;
                break;
            case 'TPE1':
                $v = decode_id3_text($data);
                if ($v !== '') $out['artist'] = $v;
                break;
            case 'TALB':
                $v = decode_id3_text($data);
                if ($v !== '') $out['album'] = $v;
                break;
            case 'TRCK':
                $v = decode_id3_text($data);
                if ($v !== '') $out['track'] = preg_replace('/\/\d+$/', '', $v);
                break;
            case 'TCON':
                $g = decode_id3_text($data);
                $g = normalize_id3_genre($g);
                if ($g !== '') $out['genre'] = $g;
                break;
            case 'TYER':
            case 'TDRC':
                $y = decode_id3_text($data);
                if (preg_match('/(\d{4})/', $y, $m)) $out['year'] = (int)$m[1];
                break;
            case 'APIC':
            case 'PIC':
                $out['hasCover'] = true;
                break;
            case 'USLT':
            case 'ULT':
                if (strlen($data) > 4 && empty($out['lyrics'])) {
                    $enc = ord($data[0]);
                    $rest = substr($data, 4);
                    if ($enc === 1 || $enc === 2) {
                        $nullPos = strpos($rest, "\0\0");
                        if ($nullPos !== false) $rest = substr($rest, $nullPos + 2);
                    } else {
                        $nullPos = strpos($rest, "\0");
                        if ($nullPos !== false) $rest = substr($rest, $nullPos + 1);
                    }
                    $lyricVal = decode_id3_text(chr($enc) . $rest);
                    if (!empty($lyricVal)) $out['lyrics'] = $lyricVal;
                }
                break;
        }
    }
}

function decode_id3_text($raw) {
    if ($raw === '') return '';
    $enc = ord($raw[0]);
    $body = substr($raw, 1);
    $text = $body;

    switch ($enc) {
        case 1: // UTF-16 with BOM
            $body = preg_replace('/^\xFF\xFE|^\xFE\xFF/', '', $body);
            if (function_exists('iconv')) {
                $text = @iconv('UTF-16', 'UTF-8//IGNORE', $body);
            } elseif (function_exists('mb_convert_encoding')) {
                $text = @mb_convert_encoding($body, 'UTF-8', 'UTF-16');
            } else {
                $text = str_replace("\0", '', $body);
            }
            break;
        case 2: // UTF-16BE without BOM
            if (function_exists('iconv')) {
                $text = @iconv('UTF-16BE', 'UTF-8//IGNORE', $body);
            } elseif (function_exists('mb_convert_encoding')) {
                $text = @mb_convert_encoding($body, 'UTF-8', 'UTF-16BE');
            } else {
                $text = str_replace("\0", '', $body);
            }
            break;
        case 3: // UTF-8
            $text = $body;
            break;
        default: // ISO-8859-1
            if (function_exists('iconv')) {
                $text = @iconv('ISO-8859-1', 'UTF-8//IGNORE', $body);
            } elseif (function_exists('mb_convert_encoding')) {
                $text = @mb_convert_encoding($body, 'UTF-8', 'ISO-8859-1');
            } else {
                $text = str_replace("\0", '', $body);
            }
    }
    return trim(str_replace("\0", '', $text ?: $body));
}

function read_php_flac_tags($path, $fileSize) {
    $out = ['title' => null, 'artist' => null, 'album' => null, 'genre' => null, 'year' => null, 'track' => null, 'duration' => null, 'bitrate' => null, 'sampleRate' => null, 'channels' => null, 'bitDepth' => 16, 'hasCover' => false, 'lyrics' => null];
    $fh = @fopen($path, 'rb');
    if (!$fh) return $out;

    $magic = fread($fh, 4);
    if ($magic !== 'fLaC') {
        fclose($fh);
        return $out;
    }

    $isLast = false;
    while (!$isLast && !feof($fh)) {
        $header = fread($fh, 4);
        if (strlen($header) < 4) break;
        $byte0 = ord($header[0]);
        $isLast = ($byte0 & 0x80) !== 0;
        $type = $byte0 & 0x7F;
        $len = (ord($header[1]) << 16) | (ord($header[2]) << 8) | ord($header[3]);
        if ($len <= 0) break;

        if ($type === 0 && $len >= 34) { // STREAMINFO
            $info = fread($fh, $len);
            $sr = (ord($info[10]) << 12) | (ord($info[11]) << 4) | (ord($info[12]) >> 4);
            $ch = ((ord($info[12]) >> 1) & 0x07) + 1;
            $bps = (((ord($info[12]) & 0x01) << 4) | (ord($info[13]) >> 4)) + 1;
            $samplesHi = ord($info[13]) & 0x0F;
            $samplesLo = unpack('N', substr($info, 14, 4))[1];
            $totalSamples = ($samplesHi * 4294967296) + $samplesLo;
            $out['sampleRate'] = $sr;
            $out['channels'] = $ch;
            $out['bitDepth'] = $bps;
            if ($sr > 0) {
                $out['duration'] = round($totalSamples / $sr, 2);
                if ($out['duration'] > 0) {
                    $out['bitrate'] = (int)round(($fileSize * 8) / $out['duration'] / 1000);
                }
            }
        } elseif ($type === 6) { // PICTURE
            $out['hasCover'] = true;
            fseek($fh, $len, SEEK_CUR);
        } elseif ($type === 4) { // VORBIS_COMMENT
            $commentBlock = fread($fh, $len);
            $vendorLen = unpack('V', substr($commentBlock, 0, 4))[1];
            $pos = 4 + $vendorLen;
            if ($pos + 4 <= strlen($commentBlock)) {
                $commentCount = unpack('V', substr($commentBlock, $pos, 4))[1];
                $pos += 4;
                for ($i = 0; $i < $commentCount; $i++) {
                    if ($pos + 4 > strlen($commentBlock)) break;
                    $cLen = unpack('V', substr($commentBlock, $pos, 4))[1];
                    $pos += 4;
                    if ($pos + $cLen > strlen($commentBlock)) break;
                    $comment = substr($commentBlock, $pos, $cLen);
                    $pos += $cLen;
                    $eq = strpos($comment, '=');
                    if ($eq !== false) {
                        $k = strtoupper(substr($comment, 0, $eq));
                        $v = trim(substr($comment, $eq + 1));
                        if ($k === 'TITLE') $out['title'] = $v;
                        elseif ($k === 'ARTIST') $out['artist'] = $v;
                        elseif ($k === 'ALBUM') $out['album'] = $v;
                        elseif ($k === 'GENRE') $out['genre'] = $v;
                        elseif ($k === 'DATE' || $k === 'YEAR') {
                            if (preg_match('/\d{4}/', $v, $m)) $out['year'] = (int)$m[0];
                        }
                        elseif ($k === 'TRACKNUMBER' || $k === 'TRACK') $out['track'] = preg_replace('/\/\d+$/', '', $v);
                        elseif ($k === 'LYRICS' || $k === 'UNSYNCEDLYRICS') $out['lyrics'] = $v;
                    }
                }
            }
        } else {
            fseek($fh, $len, SEEK_CUR);
        }
    }

    fclose($fh);
    return $out;
}

function format_filesize($bytes) {
    if ($bytes >= 1048576) {
        return round($bytes / 1048576, 2) . ' MB';
    }
    return round($bytes / 1024, 1) . ' KB';
}
