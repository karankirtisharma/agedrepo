"""Build the three Ruddix service objects: Web, Automation, SaaS.

Run headless:
  blender --background --factory-startup --python build_icons.py -- <out_dir>

Writes web.glb, automation.glb, saas.glb to <out_dir>/../public/models plus a preview.
Each object is ~0.3 m and sits on z = 0, facing -Y. Mesh names start with the part
type (Frame, Bar, Dot, Block, Gear, Flow, Node, Rack, Led, Chart, ChartBar) so the web
scenes can give each part its own ink material.
"""
import bpy, bmesh, math, os, sys

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.dirname(__file__)


def rounded_box(name, size, loc, radius=0.004, segs=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if radius > 0:
        bev = ob.modifiers.new("Bevel", "BEVEL")
        bev.width = radius
        bev.segments = segs
        bev.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth()
    return ob


def cylinder(name, r, depth, loc, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    bpy.ops.object.shade_smooth()
    return ob


def gear(name, r_out, r_in, teeth, thick, hole, loc, rot_z=0.0):
    """Extruded spur gear: tooth profile on a circle, centre hole, slight bevel."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    pts = []
    for i in range(teeth):
        a0 = 2 * math.pi * i / teeth
        step = 2 * math.pi / teeth
        for frac, r in ((0.0, r_in), (0.18, r_in), (0.28, r_out), (0.62, r_out), (0.72, r_in)):
            a = a0 + step * frac + rot_z
            pts.append((r * math.cos(a), r * math.sin(a)))
    outer = [bm.verts.new((x, 0, y)) for x, y in pts]          # gear faces -Y: profile in XZ plane
    inner = [bm.verts.new((hole * math.cos(2 * math.pi * k / 48), 0, hole * math.sin(2 * math.pi * k / 48))) for k in range(48)]
    # ring face via bridge: make outer and inner edge loops, then fill
    for loop in (outer, inner):
        for k in range(len(loop)):
            bm.edges.new((loop[k], loop[(k + 1) % len(loop)]))
    bmesh.ops.bridge_loops(bm, edges=bm.edges[:])
    bmesh.ops.triangle_fill(bm, use_beauty=True, edges=bm.edges[:]) if False else None
    geom = bm.faces[:] + bm.edges[:] + bm.verts[:]
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += thick
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.location.y -= thick / 2
    bev = ob.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.002
    bev.segments = 2
    bev.limit_method = "ANGLE"
    for p in me.polygons:
        p.use_smooth = False
    return ob


def tube_along(name, points, r=0.006):
    """Thin tube following a polyline (the automation 'flow' lines)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 3
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.active_object
    ob.name = name
    return ob


def group(name, objs):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        o.parent = root
    return root


def build_web():
    W, H, D = 0.36, 0.26, 0.03
    parts = [rounded_box("Frame", (W, D, H), (0, 0, H / 2), 0.008)]
    parts.append(rounded_box("Bar", (W - 0.01, 0.006, 0.03), (0, -D / 2 - 0.002, H - 0.022), 0.002))
    for i in range(3):
        parts.append(cylinder(f"Dot{i}", 0.006, 0.006, (-W / 2 + 0.022 + i * 0.018, -D / 2 - 0.006, H - 0.022), rot=(math.pi / 2, 0, 0), verts=16))
    # carved layout: hero block, two columns, a button
    face_y = -D / 2 - 0.004
    parts.append(rounded_box("BlockHero", (W - 0.05, 0.008, 0.07), (0, face_y, H - 0.09), 0.002))
    parts.append(rounded_box("BlockA", (0.14, 0.008, 0.07), (-0.08, face_y, 0.07), 0.002))
    parts.append(rounded_box("BlockB", (0.14, 0.008, 0.07), (0.085, face_y, 0.07), 0.002))
    parts.append(rounded_box("BlockButton", (0.07, 0.012, 0.022), (-0.1, face_y - 0.002, H - 0.155), 0.004))
    # cursor arrow floating in front
    me = bpy.data.meshes.new("Cursor")
    bm = bmesh.new()
    pts = [(0, 0), (0, -0.05), (0.012, -0.038), (0.022, -0.06), (0.03, -0.056), (0.02, -0.035), (0.036, -0.035)]
    vs = [bm.verts.new((x, 0, z)) for x, z in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += 0.008
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    cur = bpy.data.objects.new("Cursor", me)
    bpy.context.collection.objects.link(cur)
    cur.location = (0.12, -D / 2 - 0.05, 0.13)
    parts.append(cur)
    return group("Web", parts)


def build_automation():
    parts = [
        gear("GearA", 0.1, 0.082, 14, 0.035, 0.03, (-0.06, 0, 0.16)),
        gear("GearB", 0.068, 0.054, 10, 0.035, 0.02, (0.105, 0, 0.12), rot_z=math.pi / 10),
    ]
    # flow lines: from a node on the left, around the gears, to a node on the right
    flow1 = tube_along("Flow1", [(-0.2, -0.03, 0.02), (-0.14, -0.05, 0.05), (-0.06, -0.06, 0.03), (0.05, -0.05, 0.015), (0.2, -0.03, 0.03)])
    flow2 = tube_along("Flow2", [(-0.2, -0.02, 0.29), (-0.1, -0.05, 0.3), (0.03, -0.05, 0.26), (0.13, -0.04, 0.27), (0.2, -0.02, 0.24)])
    parts += [flow1, flow2]
    for i, p in enumerate([(-0.2, -0.03, 0.02), (0.2, -0.03, 0.03), (-0.2, -0.02, 0.29), (0.2, -0.02, 0.24)]):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016, location=p, segments=20, ring_count=12)
        n = bpy.context.active_object
        n.name = f"Node{i}"
        bpy.ops.object.shade_smooth()
        parts.append(n)
    return group("Automation", parts)


def build_saas():
    parts = []
    for i in range(3):
        z = 0.035 + i * 0.075
        parts.append(rounded_box(f"Rack{i}", (0.26, 0.2, 0.065), (0, 0, z), 0.006))
        for k in range(3):
            parts.append(rounded_box(f"Led{i}{k}", (0.012, 0.006, 0.012), (-0.1 + k * 0.022, -0.101, z), 0.002))
        parts.append(rounded_box(f"Slot{i}", (0.1, 0.006, 0.008), (0.07, -0.101, z), 0.001))
    # floating dashboard panel with a bar chart
    parts.append(rounded_box("Chart", (0.2, 0.012, 0.13), (0.03, -0.06, 0.34), 0.006))
    for k, h in enumerate((0.03, 0.05, 0.04, 0.075, 0.095)):
        parts.append(rounded_box(f"ChartBar{k}", (0.022, 0.008, h), (-0.04 + k * 0.035, -0.07, 0.29 + h / 2), 0.001))
    return group("SaaS", parts)


def export_root(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for c in root.children_recursive:
        c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)


def preview(path):
    sc = bpy.context.scene
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    cam.location = (0.3, -1.6, 0.42)
    cam.rotation_euler = (math.radians(82), 0, math.radians(10))
    cam.data.lens = 40
    sc.camera = cam
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    sc.collection.objects.link(sun)
    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.04, 0.05, 1)
    sc.world = w
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1000, 500
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    web, auto, saas = build_web(), build_automation(), build_saas()
    web.location.x, saas.location.x = -0.5, 0.5
    preview(os.path.join(OUT, "icons_preview.png"))
    models = os.path.join(OUT, "..", "public", "models")
    os.makedirs(models, exist_ok=True)
    for root, name in ((web, "web"), (auto, "automation"), (saas, "saas")):
        root.location.x = 0
        export_root(root, os.path.join(models, f"{name}.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "icons.blend"))
    print("ICONS_OK", sorted(o.name for o in bpy.data.objects if o.type == "MESH"))
