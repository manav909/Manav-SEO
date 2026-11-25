from PIL import Image, ImageDraw, ImageFont
W,H=1280,720; NAVY=(11,18,32); NAVY2=(26,36,64); YEL=(253,185,19); WHITE=(255,255,255); MUT=(200,208,222)
im=Image.new('RGB',(W,H)); d=ImageDraw.Draw(im)
for y in range(H):
    c=tuple(int(NAVY[k]+(NAVY2[k]-NAVY[k])*y/H) for k in range(3)); d.line([(0,y),(W,y)],fill=c)
I=lambda s,w='ExtraBold': ImageFont.truetype(f'/usr/share/fonts/opentype/inter/Inter-{w}.otf',s)
m=Image.open('/home/claude/manav-seo/sites/businesssanta/assets/img/manav-cut-860.webp').convert('RGBA'); m.thumbnail((470,640))
im.paste(m,(W-m.width-10,H-m.height),m)
d.rounded_rectangle((50,46,330,104),29,fill=YEL); d.text((190,75),'CLIENT STORY',font=I(30),fill=NAVY,anchor='mm')
y=150
for txt,col in [('Barbershop',WHITE),('now #3',YEL),('on Google',YEL)]:
    d.text((50,y),txt,font=I(100),fill=col); y+=122
d.text((52,y+20),'A real Los Angeles client story',font=I(34,'Bold'),fill=MUT)
im.save('thumbnail.jpg',quality=90)
