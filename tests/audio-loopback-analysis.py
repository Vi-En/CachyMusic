"""Synthetic positive/negative controls for the user-side capture analysis tool."""
import importlib.util,math,struct,tempfile,wave
from pathlib import Path
spec=importlib.util.spec_from_file_location('analysis',Path(__file__).resolve().parents[1]/'tools/audio-diagnostics/analyze-loopback.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
    rate=16000
    for kind in ('clean','clipped','swapped','dropout'):
        path=Path(d)/f'{kind}.wav'
        with wave.open(str(path),'wb') as w:
            w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
            buf=bytearray()
            for i in range(rate*2):
                l=.1*math.sin(i*2*math.pi*997/rate);r=.07*math.sin(i*2*math.pi*1511/rate)
                if kind=='clipped':l=max(-1,min(1,l*20));r=max(-1,min(1,r*30))
                if kind=='swapped':l,r=r,l
                if kind=='dropout' and rate//2<=i<rate:l=r=0
                buf+=struct.pack('<hh',min(32767,round(l*32768)),min(32767,round(r*32768)))
            w.writeframes(buf)
        result=m.analyze(path,0,2);l,r=result['channels'];assert not result['physical_output_verified']
        if kind=='clean':assert l['median_normalized_tone_fit_residual']<.001 and r['median_normalized_tone_fit_residual']<.001 and l['integer_full_scale_samples']==0
        if kind=='clipped':assert l['integer_full_scale_samples']>0 and l['median_normalized_tone_fit_residual']>.1
        if kind=='swapped':assert l['median_other_tone_to_expected_ratio']>10 and r['median_other_tone_to_expected_ratio']>10
        if kind=='dropout':assert l['silent_windows_below_minus65_dbfs']==2 and r['silent_windows_below_minus65_dbfs']==2
        print('PASS capture analysis',kind)
