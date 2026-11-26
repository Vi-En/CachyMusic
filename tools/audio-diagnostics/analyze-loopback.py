#!/usr/bin/env python3
"""Offline analysis of a user-supplied stereo integer-PCM WAV reference capture.
Reference: left 997 Hz, right 1511 Hz. No upload or microphone access.
The normalized residual is a tone-fit error, not certified THD+N.
"""
import argparse, array, json, math, statistics, struct, sys, wave
from pathlib import Path

def db(value):return round(20*math.log10(value),3) if value>0 else None

def analyze(path,skip,seconds):
    with wave.open(str(path),'rb') as f:
        rate,width,channels=f.getframerate(),f.getsampwidth(),f.getnchannels()
        if channels!=2 or width not in (2,3,4) or not 8000<=rate<=384000 or f.getcomptype()!='NONE':raise ValueError('Use stereo 16/24/32-bit integer PCM WAV.')
        start=round(skip*rate);n=min(round(seconds*rate),f.getnframes()-start)
        if n<rate:raise ValueError('Select at least one second of steady reference tone.')
        f.setpos(start);scale=1<<(width*8-1);window=round(rate*.25);windows=n//window
        freqs=(997,1511);basis=[[(math.sin(2*math.pi*hz*i/rate),math.cos(2*math.pi*hz*i/rate)) for i in range(window)] for hz in freqs]
        states=[{'peaks':[],'amps':[],'residuals':[],'opposite':[],'silence':0,'clipped':0,'total':0} for _ in freqs]
        for _ in range(windows):
            raw=f.readframes(window)
            if len(raw)!=window*width*2:raise ValueError('Truncated WAV capture.')
            if width in (2,4):
                values=array.array('h' if width==2 else 'i');values.frombytes(raw)
                if sys.byteorder!='little':values.byteswap()
            else:values=[int.from_bytes(raw[i:i+3],'little',signed=True) for i in range(0,len(raw),3)]
            for c,t in enumerate(states):
                raw_ch=values[c::2];t['clipped']+=sum(v>=scale-1 or v<=-scale for v in raw_ch);t['total']+=len(raw_ch)
                xs=[v/scale for v in raw_ch];peak=max(map(abs,xs));t['peaks'].append(peak)
                if peak<10**(-65/20):t['silence']+=1;continue
                mean=sum(xs)/len(xs);ys=[x-mean for x in xs];power=sum(x*x for x in ys)
                if not power:continue
                def fit(b):
                    ss=cc=sc=sy=cy=0
                    for y,(u,v) in zip(ys,b):ss+=u*u;cc+=v*v;sc+=u*v;sy+=u*y;cy+=v*y
                    den=ss*cc-sc*sc;u=(sy*cc-cy*sc)/den;v=(cy*ss-sy*sc)/den
                    return math.hypot(u,v),math.sqrt(max(0,power-u*sy-v*cy)/power)
                amp,residual=fit(basis[c]);leak,_=fit(basis[1-c]);t['amps'].append(amp);t['residuals'].append(residual);t['opposite'].append(leak/max(amp,1e-20))
        results=[]
        for c,t in enumerate(states):
            results.append({'channel':'left' if c==0 else 'right','expected_frequency_hz':freqs[c],'window_count':len(t['peaks']),'silent_windows_below_minus65_dbfs':t['silence'],'peak_dbfs':db(max(t['peaks'],default=0)),'integer_full_scale_samples':t['clipped'],'samples_examined':t['total'],'median_tone_amplitude_dbfs':db(statistics.median(t['amps'])) if t['amps'] else None,'median_normalized_tone_fit_residual':statistics.median(t['residuals']) if t['residuals'] else None,'worst_normalized_tone_fit_residual':max(t['residuals'],default=None),'median_other_tone_to_expected_ratio':statistics.median(t['opposite']) if t['opposite'] else None})
    return {'schema':1,'sample_rate_hz':rate,'integer_pcm_bits':width*8,'analyzed_seconds':windows*window/rate,'skip_seconds':skip,'channels':results,'physical_output_verified':False,'interpretation':'Capture-path measurements only. Compare identical captures from a reference player. Clock drift, fades, EQ, resampling, recording noise and capture gain affect results. Not THD+N, bit-perfect certification or automatic pass.'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('wav',type=Path);p.add_argument('--skip',type=float,default=1);p.add_argument('--seconds',type=float,default=4);p.add_argument('--output',type=Path);a=p.parse_args()
    if not math.isfinite(a.skip) or not math.isfinite(a.seconds) or a.skip<0 or not 1<=a.seconds<=30:p.error('Use nonnegative skip and 1–30 seconds.')
    result=json.dumps(analyze(a.wav,a.skip,a.seconds),indent=2)+'\n'
    if a.output:a.output.write_text(result)
    else:print(result,end='')
if __name__=='__main__':main()
