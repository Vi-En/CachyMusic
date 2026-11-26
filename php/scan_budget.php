<?php
// Monotonic cooperative scan budget. Native filesystem calls, PHP parser calls,
// database commits and network filesystems are not preemptible by this guard.
final class CachyScanLimit extends RuntimeException {}
final class CachyScanBudget {
    private float $deadline;
    private int $entries=0, $tracks=0, $bytes=0;
    private int $entryLimit, $trackLimit, $byteLimit;
    private static function limit(string $key,int $default,int $min,int $max): int {
        $raw=getenv($key);
        if ($raw===false||$raw==='') return $default;
        $v=filter_var($raw,FILTER_VALIDATE_INT,['options'=>['min_range'=>$min,'max_range'=>$max]]);
        if ($v===false) throw new CachyScanLimit('Invalid administrator scan budget configuration.');
        return $v;
    }
    public function __construct(private ?Closure $cancellation=null) {
        $seconds=self::limit('CACHYMUSIC_SCAN_SECONDS',300,1,3600);
        $this->deadline=hrtime(true)/1e9+$seconds;
        $this->entryLimit=self::limit('CACHYMUSIC_SCAN_ENTRIES',250000,1,1000000);
        $this->trackLimit=self::limit('CACHYMUSIC_SCAN_TRACKS',25000,1,25000);
        $this->byteLimit=self::limit('CACHYMUSIC_SCAN_BYTES',32*1024*1024,1024,64*1024*1024);
    }
    public function checkpoint(): void {
        if (hrtime(true)/1e9 >= $this->deadline) throw new CachyScanLimit('Scan time budget exceeded. Use a smaller directory or adjust the backend scan budget.');
        if ($this->cancellation) ($this->cancellation)();
        if (connection_aborted()) throw new CachyScanLimit('Scan client disconnected.');
    }
    public function remaining(float $maximum): float { $this->checkpoint(); return max(0.001,min($maximum,$this->deadline-hrtime(true)/1e9)); }
    public function visit(int $depth): void {
        $this->checkpoint();
        if (++$this->entries>$this->entryLimit || $depth>12) throw new CachyScanLimit('Scan traversal budget exceeded. Choose a smaller or shallower directory.');
    }
    public function track(): void { if (++$this->tracks>$this->trackLimit) throw new CachyScanLimit('Scan track budget exceeded; no partial library was published.'); }
    public function account(array $row): void {
        $this->bytes+=strlen(json_encode($row,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR))+1;
        $this->response($this->bytes);
    }
    public function response(int $bytes): void { if ($bytes>$this->byteLimit) throw new CachyScanLimit('Scan response budget exceeded; choose a smaller library.'); }
}
