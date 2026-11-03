import bpy, sys, math
from mathutils import Matrix, Vector
out=sys.argv[sys.argv.index('--')+1]
level=int(sys.argv[sys.argv.index('--')+2])
sc=bpy.context.scene
# 1. убрать камеры, свет, служебные плоскости и госномера
drop=[o for o in sc.objects if o.type!='MESH' or o.name.startswith('Plane') or o.name in ('Object_11','Object_12')]
for o in drop: bpy.data.objects.remove(o, do_unlink=True)
# 2. сглаживание
for o in sc.objects:
    for m in o.modifiers:
        if m.type=='SUBSURF': m.levels=level; m.render_levels=level
# 3. перед машины в +Y Blender (= -Z в three.js), колёса на полу, по центру
R=Matrix.Rotation(math.pi,4,'Z')
for o in sc.objects: o.matrix_world = R @ o.matrix_world
bpy.context.view_layer.update()
pts=[o.matrix_world @ Vector(c) for o in sc.objects for c in o.bound_box]
mn=[min(p[i] for p in pts) for i in range(3)]; mx=[max(p[i] for p in pts) for i in range(3)]
T=Matrix.Translation(Vector((-(mn[0]+mx[0])/2, -(mn[1]+mx[1])/2, -mn[2])))
for o in sc.objects: o.matrix_world = T @ o.matrix_world
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
    e=o.evaluated_get(dg).to_mesh(); tris+=sum(len(p.vertices)-2 for p in e.polygons)
print("TRIS",tris)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_cameras=False, export_lights=False, export_image_format='WEBP', export_yup=True)
print("DONE")
