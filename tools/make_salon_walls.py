"""Текстуры стен зала /salon/ из сгенерированных wall-*.png: обрезка по линии пола, чистка нарисованных надписей,
настоящий логотип Evolution Car, кирпичные простенки по краям (без зеркальных повторов), бесшовный бетон пола."""
import numpy as np
from PIL import Image, ImageFilter
G='/Users/artemgalimov/.cache/zeekr-salon/'; SITE='/Users/artemgalimov/Sites/zeekr-configurator/'
O=SITE+'assets/salon/'; LOGO=Image.open(SITE+'assets/stage/logo.png').convert('RGBA')
FLOOR={'back':0.89,'front':0.895,'left':0.833,'right':0.91}   # линия пола, доля высоты кадра
EXT=0.15            # простенок с каждой стороны, доля ширины кадра
ASPECT=22/7

def crop(n):
    im=Image.open(G+f'wall-{n}.png').convert('RGB'); w,h=im.size
    bot=int(FLOOR[n]*h); top=max(0,bot-int(0.833*h)); return im.crop((0,top,w,bot))

def wipe(im, x0,y0,x1,y1):
    """Закрасить прямоугольник (доли кадра) плавным переходом между его левым и правым краем."""
    a=np.asarray(im).astype(np.float32); h,w=a.shape[:2]
    X0,X1,Y0,Y1=int(x0*w),int(x1*w),int(y0*h),int(y1*h)
    L=a[Y0:Y1,X0-5:X0].mean(axis=1,keepdims=True); R=a[Y0:Y1,X1:X1+5].mean(axis=1,keepdims=True)
    t=np.linspace(0,1,X1-X0)[None,:,None]
    a[Y0:Y1,X0:X1]=L*(1-t)+R*t
    out=Image.fromarray(a.clip(0,255).astype(np.uint8))
    box=(X0-3,Y0-3,X1+3,Y1+3); out.paste(out.crop(box).filter(ImageFilter.GaussianBlur(2)),box[:2]); return out

def logo(im, cx,cy,width, glow=True):
    """Настоящий логотип белым, по центру (доли кадра), ширина – доля кадра."""
    w,h=im.size; lw=int(width*w); lg=LOGO.resize((lw,round(lw*LOGO.height/LOGO.width)),Image.LANCZOS)
    pos=(int(cx*w-lg.width/2),int(cy*h-lg.height/2)); base=im.convert('RGBA')
    if glow:
        g=Image.new('RGBA',lg.size,(255,240,220,0)); g.putalpha(lg.split()[3].filter(ImageFilter.GaussianBlur(lw/60)).point(lambda v:int(v*0.55)))
        base.alpha_composite(g,pos)
    base.alpha_composite(lg,pos); return base.convert('RGB')

def flag_logo(im, cx,cy,length, angle, color):
    """Логотип вдоль флага: length – доля высоты кадра, angle – поворот в градусах."""
    w,h=im.size; L=int(length*h); lg=LOGO.resize((L,round(L*LOGO.height/LOGO.width)),Image.LANCZOS)
    tint=Image.new('RGBA',lg.size,color+(0,)); tint.putalpha(lg.split()[3].point(lambda v:int(v*0.92)))
    rot=tint.rotate(angle,expand=True,resample=Image.BICUBIC); base=im.convert('RGBA')
    base.alpha_composite(rot,(int(cx*w-rot.width/2),int(cy*h-rot.height/2))); return base.convert('RGB')

def clean_flag(im, x0,y0,x1,y1, dark):
    """Убрать текст с флага: dark=True – тёмный флаг со светлым текстом, иначе белый с тёмным."""
    a=np.asarray(im).astype(np.float32); h,w=a.shape[:2]
    X0,X1,Y0,Y1=int(x0*w),int(x1*w),int(y0*h),int(y1*h); r=a[Y0:Y1,X0:X1]
    lum=r.mean(axis=2); sat=(r.max(axis=2)-r.min(axis=2))/(r.max(axis=2)+1)
    body=((lum<80)&(sat<0.4)) if dark else ((lum>165)&(sat<0.22))
    m=Image.fromarray((body*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(23)).filter(ImageFilter.MinFilter(27))
    inside=np.asarray(m)>127
    ref=np.median(lum[body]); text=inside&((lum>ref+22) if dark else (lum<ref-18))
    fill=np.median(r[body],axis=0)
    shade=np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(25))).astype(np.float32)
    k=(shade/ (shade[body].mean()+1))[...,None].clip(0.8,1.2)
    r[text]=(fill*k)[text]
    a[Y0:Y1,X0:X1]=r; out=Image.fromarray(a.clip(0,255).astype(np.uint8))
    box=(X0,Y0,X1,Y1); out.paste(out.crop(box).filter(ImageFilter.GaussianBlur(1.2)),box[:2]); return out

W={n:crop(n) for n in FLOOR}
# вход: вывеска над дверью, табличка с часами, текст на флагах
f=W['front']
f=wipe(f,0.203,0.255,0.343,0.41); f=wipe(f,0.215,0.655,0.262,0.83)
f=clean_flag(f,0.012,0.47,0.097,0.985,True); f=clean_flag(f,0.352,0.46,0.42,0.985,False)
f=flag_logo(f,0.056,0.73,0.36,80,(255,255,255)); f=flag_logo(f,0.386,0.725,0.36,84,(28,28,30)); W['front']=f
# оливковая стена: нарисованная вывеска → настоящий логотип
l=wipe(W['left'],0.152,0.495,0.318,0.67); W['left']=logo(l,0.235,0.585,0.15)
# кирпичная стена: надпись на стекле двери → настоящий логотип
r=wipe(W['right'],0.075,0.50,0.168,0.635); W['right']=logo(r,0.1215,0.57,0.082,glow=False)

# простенки: чистый кирпичный пилястр со стены входа, сложенный в ширину без зеркальных отражений
b=W['front']; w,h=b.size; pier=b.crop((int(0.522*w),0,int(0.572*w),h)); fw=int(EXT*w)
# повторяем столб без отражений, стыки смягчаем плавным переходом
ov=18; pa=np.asarray(pier).astype(np.float32); pw=pa.shape[1]; fa=np.zeros((h,fw+pw,3),np.float32); x=0
while x<fw:
    if x==0: fa[:,:pw]=pa
    else:
        t=np.linspace(0,1,ov)[None,:,None]
        fa[:,x:x+ov]=fa[:,x:x+ov]*(1-t)+pa[:,:ov]*t; fa[:,x+ov:x+pw]=pa[:,ov:]
    x+=pw-ov
fill=Image.fromarray(fa[:,:fw].clip(0,255).astype(np.uint8))
for n,im in W.items():
    out=Image.new('RGB',(w+2*fw,h)); out.paste(fill,(0,0)); out.paste(im,(fw,0)); out.paste(fill,(fw+w,0))
    out=out.resize((3072,round(3072/ASPECT)),Image.LANCZOS); out.save(O+f'wall-{n}.webp','WEBP',quality=82,method=6); W[n]=out

# бесшовный бетон: края берём из середины того же фото, чтобы плитка повторялась без зеркала
c=np.asarray(Image.open(SITE+'assets/stage/concrete.jpg').convert('RGB')).astype(np.float32); H2,W2=c.shape[:2]
s=np.roll(c,(H2//2,W2//2),axis=(0,1)); yy,xx=np.mgrid[0:H2,0:W2]
m=np.minimum(np.minimum(xx,W2-1-xx)/(W2*0.22),np.minimum(yy,H2-1-yy)/(H2*0.22)).clip(0,1)[...,None]
Image.fromarray((c*m+s*(1-m)).clip(0,255).astype(np.uint8)).save(O+'concrete.webp','WEBP',quality=84,method=6)

sheet=Image.new('RGB',(1600,4*262))
for i,n in enumerate(W): sheet.paste(W[n].resize((1600,254)),(0,i*262))
sheet.save(G+'walls-final.jpg',quality=88)
