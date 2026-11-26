package org.cachymusic.app;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
final class MediaRangeContract {
    private MediaRangeContract() {}
    static long offset(String raw) { if(raw==null||!raw.matches("[0-9]{1,15}")) throw new IllegalArgumentException("Invalid range offset"); return Long.parseLong(raw); }
    static boolean valid(long start,long end) { return start>=0&&end>=start&&end-start<4L*1024*1024; }
    static String version(String uri,long dev,long ino,long size,long mtime,long ctime) throws Exception {
        String value=uri.length()+":"+uri+":"+dev+":"+ino+":"+size+":"+mtime+":"+ctime;
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result=new StringBuilder(64);for(byte b:digest)result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return result.toString();
    }
}
