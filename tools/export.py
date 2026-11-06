import bpy, sys, math
from mathutils import Matrix, Vector
out=sys.argv[sys.argv.index('--')+1]
level=int(sys.argv[sys.argv.index('--')+2])
sc=bpy.context.scene
# 1. убрать камеры, свет, служебные плоскости и госномера
drop=[o for o in sc.objects if o.type not in ('MESH',) or o.name.startswith('Plane') or o.name in ('Object_11','Object_12')]
for o in drop: bpy.data.objects.remove(o, do_unlink=True)
# 1б. Открывающиеся части: куски кузова (острова сетки), целиком лежащие в границах двери, капота, багажника,
# выносим в отдельные объекты и вешаем на пустышку-петлю. Геометрия не меняется, только делится.
import bmesh
R0=Matrix.Rotation(math.pi,4,'Z')        # в этих координатах перёд машины = +Y
SIDE=dict(x=(-1.2,-0.55))
def box(x,y,z): return dict(x=x,y=y,z=z)
PARTS={
 'Door_LF':dict(region=box((-1.2,-0.55),(-0.14,1.08),(0.35,1.74)),hinge=(-0.92,1.06,0.9)),
 'Door_LB':dict(region=box((-1.2,-0.55),(-1.28,-0.02),(0.35,1.74)),hinge=(-0.92,-0.04,0.9)),
 'Door_RF':dict(region=box((0.55,1.2),(-0.14,1.08),(0.35,1.74)),hinge=(0.92,1.06,0.9)),
 'Door_RB':dict(region=box((0.55,1.2),(-1.28,-0.02),(0.35,1.74)),hinge=(0.92,-0.04,0.9)),
 'Hood':dict(region=box((-0.95,0.95),(1.10,2.48),(0.98,1.30)),hinge=(0,1.13,1.2),only=('Car_Paint','Logo_PNG','NamePlates')),
 'Trunk':dict(region=box((-0.72,0.72),(-2.65,-1.90),(0.93,1.72)),hinge=(0,-1.93,1.70)),
}
SKIP=('Interior','Bottom','Radiator','Cameras')
def inside(mn,mx,r,t=0.02):
    return all(r[k][0]-t<=mn[i] and mx[i]<=r[k][1]+t for i,k in enumerate('xyz'))
def islands(bm):
    seen=set(); out=[]
    for v in bm.verts:
        if v.index in seen: continue
        st=[v]; comp=[]; seen.add(v.index)
        while st:
            a=st.pop(); comp.append(a.index)
            for e in a.link_edges:
                b=e.other_vert(a)
                if b.index not in seen: seen.add(b.index); st.append(b)
        out.append(comp)
    return out
def keep_verts(obj, idx):
    bm=bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in idx], context='VERTS')
    bm.to_mesh(obj.data); bm.free()
pivots={}
for key,p in PARTS.items():
    e=bpy.data.objects.new(key,None); sc.collection.objects.link(e)
    e.matrix_world=R0.inverted()@Matrix.Translation(Vector(p['hinge']))
    pivots[key]=e
moved={k:0 for k in PARTS}
for o in [o for o in sc.objects if o.type=='MESH']:
    if o.name.startswith(('Wheel','Tire','Cylinder')) or o.name in SKIP: continue
    bm=bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    M=R0@o.matrix_world
    take={k:set() for k in PARTS}
    for comp in islands(bm):
        pts=[M@bm.verts[i].co for i in comp]
        mn=[min(q[i] for q in pts) for i in range(3)]; mx=[max(q[i] for q in pts) for i in range(3)]
        for k,p in PARTS.items():
            if 'only' in p and o.name not in p['only']: continue
            if inside(mn,mx,p['region']): take[k].update(comp); break
    bm.free()
    rest=set(range(len(o.data.vertices)))
    for k,idx in take.items():
        if not idx: continue
        part=o.copy(); part.data=o.data.copy(); part.name=f'{k}_{o.name}'
        sc.collection.objects.link(part)
        keep_verts(part, idx)
        part.parent=pivots[k]; part.matrix_parent_inverse=pivots[k].matrix_world.inverted()
        rest-=idx; moved[k]+=len(idx)
    if len(rest)<len(o.data.vertices): keep_verts(o, rest)
print('PARTS',moved)
# Обшивка дверей сидит в общем куске салона: забираем его грани у борта в зоне каждой двери.
CARDS={'Door_LF':box((-0.9,-0.66),(-0.10,1.05),(0.40,1.30)),'Door_LB':box((-0.9,-0.66),(-1.25,-0.06),(0.40,1.30)),
       'Door_RF':box((0.66,0.9),(-0.10,1.05),(0.40,1.30)),'Door_RB':box((0.66,0.9),(-1.25,-0.06),(0.40,1.30))}
ins=bpy.data.objects.get('Interior')
if ins:
    M=R0@ins.matrix_world
    bm=bmesh.new(); bm.from_mesh(ins.data); bm.faces.ensure_lookup_table()
    take={k:set() for k in CARDS}
    for f in bm.faces:
        pts=[M@v.co for v in f.verts]
        mn=[min(q[i] for q in pts) for i in range(3)]; mx=[max(q[i] for q in pts) for i in range(3)]
        for k,r in CARDS.items():
            if inside(mn,mx,r,0): take[k].add(f.index); break
    bm.free()
    def keep_faces(obj, idx):
        b=bmesh.new(); b.from_mesh(obj.data); b.faces.ensure_lookup_table()
        bmesh.ops.delete(b, geom=[f for f in b.faces if f.index not in idx], context='FACES')
        b.to_mesh(obj.data); b.free()
    allf=set(range(len(ins.data.polygons))); rest=set(allf)
    for k,idx in take.items():
        if not idx: continue
        part=ins.copy(); part.data=ins.data.copy(); part.name=f'{k}_card'
        sc.collection.objects.link(part); keep_faces(part, idx)
        part.parent=pivots[k]; part.matrix_parent_inverse=pivots[k].matrix_world.inverted()
        rest-=idx
    keep_faces(ins, rest)
    print('CARDS',{k:len(v) for k,v in take.items()})


# 2. сглаживание
for o in sc.objects:
    for m in o.modifiers:
        if m.type=='SUBSURF': m.levels=level; m.render_levels=level
# Лёгкая версия для ряда машин на /showroom/ (аргумент lite, уровень сглаживания 0): прореживаем шины, суппорты и салон.
if 'lite' in sys.argv:
    for o in sc.objects:
        if o.type=='MESH' and o.name.startswith(('Tire','Cylinder','Radiator','Interior','Wheel_WHT')):
            d=o.modifiers.new('lite','DECIMATE'); d.ratio=0.25
# 3. перед машины в +Y Blender (= -Z в three.js), колёса на полу, по центру
R=Matrix.Rotation(math.pi,4,'Z')
for o in [o for o in sc.objects if not o.parent]: o.matrix_world = R @ o.matrix_world
bpy.context.view_layer.update()
pts=[o.matrix_world @ Vector(c) for o in sc.objects if o.type=='MESH' for c in o.bound_box]
mn=[min(p[i] for p in pts) for i in range(3)]; mx=[max(p[i] for p in pts) for i in range(3)]
T=Matrix.Translation(Vector((-(mn[0]+mx[0])/2, -(mn[1]+mx[1])/2, -mn[2])))
for o in [o for o in sc.objects if not o.parent]: o.matrix_world = T @ o.matrix_world
print("SIZE", [round(mx[i]-mn[i],2) for i in range(3)])
# 4. материалы, которые glTF не понимает, – на стандартный Principled
def principled(name, color, rough, metal=0.0, alpha=1.0, emis=None):
    mat=bpy.data.materials[name]; nt=mat.node_tree; nt.nodes.clear()
    o=nt.nodes.new('ShaderNodeOutputMaterial'); p=nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal; p.inputs['Alpha'].default_value=alpha
    if emis: p.inputs['Emission Color'].default_value=(*emis,1); p.inputs['Emission Strength'].default_value=1
    nt.links.new(p.outputs[0], o.inputs[0])
    if alpha<1:
        try: mat.surface_render_method='BLENDED'
        except Exception: pass
        mat.blend_method='BLEND'
principled('GlassBlack',(0.02,0.02,0.025),0.03,alpha=0.35)
principled('Material #2125771229',(0.6,0.0,0.0),0.1,alpha=0.6)
# стекло фар – отдельный прозрачный материал
clear=bpy.data.materials['GlassBlack'].copy(); clear.name='GlassClear'
clear.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.9,0.9,0.9,1)
clear.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=0.12
for n in ('HeadLights_Glass','TailLights_Glass_Clear'):
    o=bpy.data.objects[n]
    for s in o.material_slots: s.material=clear
tris=0
dg=bpy.context.evaluated_depsgraph_get()
for o in sc.objects:
    if o.type!='MESH': continue
    e=o.evaluated_get(dg).to_mesh(); tris+=sum(len(p.vertices)-2 for p in e.polygons)
print("TRIS",tris)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_cameras=False, export_lights=False, export_image_format='WEBP', export_yup=True)
print("DONE")
