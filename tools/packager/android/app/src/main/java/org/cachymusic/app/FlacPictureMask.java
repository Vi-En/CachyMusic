package org.cachymusic.app;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** Metadata-only WebView compatibility mask. No patch is emitted unless the
 * entire bounded metadata chain is structurally valid and present. */
final class FlacPictureMask {
    private static final long MAX_METADATA = 16L * 1024 * 1024;
    private FlacPictureMask() {}
    static Map<Long,Byte> scan(InputStream in) throws IOException {
        byte[] header=new byte[4];
        if(!readExact(in,header,4)||header[0]!='f'||header[1]!='L'||header[2]!='a'||header[3]!='C')return Collections.emptyMap();
        byte[] scratch=new byte[16384];Map<Long,Byte> patches=new HashMap<>();long offset=4;
        for(int block=0;block<4096;block++){
            if(!readExact(in,header,4))return Collections.emptyMap();
            int type=header[0]&127;boolean last=(header[0]&128)!=0;
            int length=((header[1]&255)<<16)|((header[2]&255)<<8)|(header[3]&255);
            if((block==0&&(type!=0||length!=34))||(block>0&&type==0)||type==127||offset+4L+length>MAX_METADATA)return Collections.emptyMap();
            if(type==6)patches.put(offset,(byte)((last?128:0)|1));
            int remaining=length;while(remaining>0){int n=Math.min(remaining,scratch.length);if(!readExact(in,scratch,n))return Collections.emptyMap();remaining-=n;}
            offset+=4L+length;if(last)return patches;
        }
        return Collections.emptyMap();
    }
    private static boolean readExact(InputStream in,byte[] bytes,int length)throws IOException{
        int off=0;while(off<length){int n=in.read(bytes,off,length-off);if(n<=0)return false;off+=n;}return true;
    }
}
