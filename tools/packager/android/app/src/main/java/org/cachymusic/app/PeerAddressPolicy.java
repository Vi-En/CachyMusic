package org.cachymusic.app;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;

/** The public Soulseek network must not turn the device into a LAN/loopback proxy.
 * Numeric IPv4 only, as supplied by the current peer-address protocol. LAN peers and
 * non-global special-use ranges are intentionally unsupported. No DNS lookup. */
final class PeerAddressPolicy {
    static InetSocketAddress endpoint(String host,int port)throws IOException {
        if(host==null||host.length()>15||port<1||port>65535)throw new IOException("Invalid peer endpoint");
        String[] parts=host.split("\\.",-1);
        if(parts.length!=4)throw new IOException("Invalid peer endpoint");
        int[] octets=new int[4];byte[] raw=new byte[4];
        for(int i=0;i<4;i++){
            String part=parts[i];if(!part.matches("0|[1-9][0-9]{0,2}"))throw new IOException("Invalid peer endpoint");
            int n=Integer.parseInt(part);if(n>255)throw new IOException("Invalid peer endpoint");octets[i]=n;raw[i]=(byte)n;
        }
        int a=octets[0],b=octets[1],c=octets[2];
        if(a==0||a==10||a==127||a>=224||(a==100&&b>=64&&b<=127)||(a==169&&b==254)
            ||(a==172&&b>=16&&b<=31)||(a==192&&(b==168||(b==0&&(c==0||c==2))||(b==88&&c==99)))
            ||(a==198&&(b==18||b==19||(b==51&&c==100)))||(a==203&&b==0&&c==113))
            throw new IOException("Non-public peer endpoint");
        return new InetSocketAddress(InetAddress.getByAddress(raw),port);
    }
    static boolean permitted(String host,int port){try{endpoint(host,port);return true;}catch(IOException ignored){return false;}}
}
