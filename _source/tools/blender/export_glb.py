# Xuất pen.blend -> app/assets/scene.glb + scene.json (toạ độ tờ giấy, ngòi bút, camera, đèn)
# Chạy: blender -b --python tools/blender/export_glb.py -- pen.blend app/assets
#   hoặc: python -c "import bpy" (pip install bpy==5.2.*) rồi: python tools/blender/export_glb.py pen.blend app/assets
import bpy, bmesh, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[-2:]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene

def t3(v):  # Blender (Z lên) -> three.js (Y lên)
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]

meta = {}
# ---- camera
cam = sc.camera
d = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
pos = cam.matrix_world.translation
# điểm nhìn = giao với mặt giấy
paper = bpy.data.objects.get('Plane')
pz = max(v.co.z for v in paper.data.vertices) if paper else 0.406
k = (pos.z - pz) / -d.z if d.z < 0 else 1.0
tgt = pos + d * k
w, h = sc.render.resolution_x, sc.render.resolution_y
sens = cam.data.sensor_width
fit = cam.data.sensor_fit
if fit == 'VERTICAL' or (fit == 'AUTO' and h > w): vfov = 2 * math.atan(sens / 2 / cam.data.lens)
else: vfov = 2 * math.atan(sens / 2 / cam.data.lens * h / w)
meta['camera'] = {'pos': t3(pos), 'target': t3(tgt), 'fov': round(math.degrees(vfov), 3)}

# ---- tờ giấy (4 góc, xếp: trên-trái, trên-phải, dưới-trái theo hướng nhìn camera)
if paper:
    pts = [paper.matrix_world @ v.co for v in paper.data.vertices]
    # cạnh trên = cạnh xa camera nhất (y lớn)
    pts.sort(key=lambda p: -p.y)
    top = sorted(pts[:2], key=lambda p: p.x); bot = sorted(pts[2:], key=lambda p: p.x)
    meta['paper'] = {'tl': t3(top[0]), 'tr': t3(top[1]), 'bl': t3(bot[0]), 'br': t3(bot[1])}

# ---- đèn mặt trời
for o in bpy.data.objects:
    if o.type == 'LIGHT':
        dd = o.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        meta.setdefault('lights', []).append({'type': o.data.type, 'dir': t3(dd), 'pos': t3(o.matrix_world.translation),
                                              'energy': o.data.energy, 'color': list(o.data.color)})

# ---- xoá thứ không dùng
drop = {'Camera', 'Plane', 'CINEMA_4D_Editor', 'Object_5'}
kill = []
for o in bpy.data.objects:
    chain = []; p = o
    while p: chain.append(p.name); p = p.parent
    if o.name in drop or o.type in ('LIGHT', 'CAMERA') or '02' in chain: kill.append(o.name)
for n in kill:
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)

# ---- tách bút + nắp khỏi lưới đồ vật
props = bpy.data.objects['defaultMaterial']
bpy.context.view_layer.objects.active = props
for o in bpy.context.view_layer.objects: o.select_set(False)
props.select_set(True)
me = props.data
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
mw = props.matrix_world
seen = set(); islands = []
for v in bm.verts:
    if v.index in seen: continue
    st = [v]; comp = []; seen.add(v.index)
    while st:
        x = st.pop(); comp.append(x.index)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    ws = [mw @ bm.verts[i].co for i in comp]
    mn = Vector([min(p[i] for p in ws) for i in range(3)]); mx = Vector([max(p[i] for p in ws) for i in range(3)])
    islands.append({'idx': comp, 'mn': mn, 'mx': mx, 'n': len(comp)})
bm.free()
# bút: các mảnh nổi trên mặt giấy (z > giấy + 1cm) ở vùng giữa tờ giấy (x<0.2), nắp: mảnh nằm trên giấy phía phải
pen_isl = [i for i in islands if i['mx'].z > pz + 0.02 and 0.0 < i['mn'].x < 0.2 and i['mx'].x < 0.3]
nib_isl = [i for i in islands if i['n'] > 50 and i['mx'].z < pz + 0.04 and i['mn'].z > pz - 0.002 and i['mx'].x < 0.1 and i['mn'].x > 0.0]
cap_isl = [i for i in islands if 0.2 < i['mn'].x < 0.3 and i['mx'].z < pz + 0.03 and i['n'] > 20]
print('pen', [i['n'] for i in pen_isl], 'nib', [i['n'] for i in nib_isl], 'cap', [i['n'] for i in cap_isl])

def separate(isls, name):
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    want = set(i for isl in isls for i in isl['idx'])
    for v in props.data.vertices: v.select = v.index in want
    for e in props.data.edges: e.select = all(i in want for i in e.vertices)
    for f in props.data.polygons: f.select = all(i in want for i in f.vertices)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.context.selected_objects if o != props][-1]
    new.name = name; new.select_set(False)
    return new

pen = separate(pen_isl + nib_isl, 'Pen')
cap = separate(cap_isl, 'PenCap') if cap_isl else None
# ngòi = đỉnh thấp nhất của bút; trục bút = từ ngòi tới đỉnh cao nhất
pw = [pen.matrix_world @ v.co for v in pen.data.vertices]
tip = min(pw, key=lambda p: p.z)
far = max(pw, key=lambda p: (p - tip).length)
meta['pen'] = {'tip': t3(tip), 'tail': t3(far), 'len': round((far - tip).length, 4)}
print('tip', tip, 'tail', far)
# ---- texture: giảm còn tối đa 1024px
for img in bpy.data.images:
    if img.size[0] > 1024 or img.size[1] > 1024:
        s = 1024 / max(img.size); img.scale(int(img.size[0] * s), int(img.size[1] * s))
# kính cửa sổ: tắt transmission (tốn GPU), để app làm kính trong suốt nhẹ
glb = os.path.join(OUT, 'scene.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86,
                          export_apply=True, export_cameras=False, export_lights=False, export_yup=True,
                          export_extras=False, export_animations=False)
with open(os.path.join(OUT, 'scene.json'), 'w') as f: json.dump(meta, f, indent=1)
print('OK', glb, os.path.getsize(glb) // 1024, 'KB')
print(json.dumps(meta, indent=1))
