# Demo audio

The two files in `apps/web/public/demo` are synthesized with FFmpeg, so no one owns the music in them. The "vocal" is a synthesized lead line.

```bash
ffmpeg -y -v error \
  -f lavfi -i "aevalsrc='0.10*(sin(2*PI*220*t)+sin(2*PI*261.63*t)+sin(2*PI*329.63*t))*(0.8+0.2*sin(2*PI*0.5*t))':d=16:s=44100" \
  -f lavfi -i "aevalsrc='0.22*sin(2*PI*55*t)*(0.6+0.4*sin(2*PI*2*t))':d=16:s=44100" \
  -f lavfi -i "aevalsrc='0.35*sin(2*PI*(60+80*exp(-12*mod(t,0.5)))*mod(t,0.5))*exp(-8*mod(t,0.5))':d=16:s=44100" \
  -f lavfi -i "aevalsrc='0.16*sin(2*PI*(if(lt(mod(t,4),1),440,if(lt(mod(t,4),2),523.25,if(lt(mod(t,4),3),659.25,587.33)))*t)+3*sin(2*PI*5.5*t))*(0.5+0.5*sin(2*PI*0.25*t))':d=16:s=44100" \
  -filter_complex "[0][1][2]amix=inputs=3:normalize=0,aformat=channel_layouts=stereo,afade=t=in:d=0.4,afade=t=out:st=15:d=1[inst];[0][1][2][3]amix=inputs=4:normalize=0,aformat=channel_layouts=stereo,afade=t=in:d=0.4,afade=t=out:st=15:d=1[mix]" \
  -map "[inst]" -c:a libmp3lame -b:a 96k after-instrumental.mp3 \
  -map "[mix]" -c:a libmp3lame -b:a 96k before-full-mix.mp3
```
