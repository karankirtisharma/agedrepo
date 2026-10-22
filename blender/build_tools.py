"""Build the studio's story props: Laptop, Camera, Sketchbook (with pencil).

Run headless:
  blender --background --factory-startup --python build_tools.py -- <out_dir>

Writes laptop.glb, camera.glb, sketchbook.glb to <out_dir>/../public/models plus a preview.
Objects are life-size-ish in metres, sit on z = 0 and face -Y. Mesh names start with a
part type so the web scenes can ink each part (see ICON_PARTS in public/js/scenes/common.js).
The laptop "Display" and sketchbook "Page" meshes are UV-mapped planes so the site can
draw UI / sketches onto them at runtime.
"""
import bpy, math, os, sys

sys.path.append(os.path.dirname(__file__))
from build_icons import rounded_box, cylinder, group, export_root  # shared helpers

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.dirname(__file__)


def plane(name, w, h, loc, rot):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    ob.scale = (w, h, 1)
    bpy.ops.object.transform_apply(scale=True)
    return ob


def build_laptop():
    W, D, T = 0.32, 0.22, 0.012
    parts = [rounded_box("Body", (W, D, T), (0, 0, T / 2), 0.004)]
    parts.append(rounded_box("Keys", (W - 0.04, 0.1, 0.002), (0, 0.035, T + 0.001), 0.001))
    parts.append(rounded_box("Pad", (0.09, 0.055, 0.002), (0, -0.065, T + 0.001), 0.002))
    # screen lid hinged at the back edge, opened ~105 degrees
    lid_h = 0.21
    hinge = (0, D / 2, T)
    tilt = math.radians(-15)  # leans back slightly past vertical
    lid = rounded_box("Lid", (W, 0.008, lid_h), (0, 0, lid_h / 2), 0.004)
    disp = plane("Display", W - 0.02, lid_h - 0.025, (0, -0.0045, lid_h / 2 + 0.004), (math.radians(90), 0, 0))
    root = group("LidPivot", [lid, disp])
    root.location = hinge
    root.rotation_euler = (tilt, 0, 0)
    parts.append(root)
    return group("Laptop", parts)


def build_camera():
    parts = [rounded_box("Body", (0.14, 0.06, 0.09), (0, 0, 0.045), 0.008)]
    parts.append(rounded_box("Grip", (0.03, 0.07, 0.085), (-0.058, -0.004, 0.043), 0.01))
    parts.append(rounded_box("Top", (0.05, 0.05, 0.022), (0.01, 0, 0.1), 0.004))
    parts.append(cylinder("Button", 0.008, 0.008, (-0.05, 0.0, 0.094), verts=20))
    parts.append(cylinder("Dial", 0.013, 0.008, (0.045, 0.0, 0.094), verts=24))
    # lens: stacked rings facing -Y
    rot = (math.radians(90), 0, 0)
    parts.append(cylinder("LensMount", 0.036, 0.012, (0.01, -0.036, 0.045), rot=rot))
    parts.append(cylinder("Lens", 0.032, 0.05, (0.01, -0.066, 0.045), rot=rot))
    parts.append(cylinder("LensRing", 0.034, 0.008, (0.01, -0.08, 0.045), rot=rot))
    parts.append(cylinder("LensGlass", 0.024, 0.004, (0.01, -0.092, 0.045), rot=rot))
    return group("Camera", parts)


def build_sketchbook():
    parts = []
    # open book: two covers slightly angled up from the spine, pages on top
    for side in (-1, 1):
        cover = rounded_box(f"Cover{'L' if side < 0 else 'R'}", (0.15, 0.21, 0.006), (side * 0.077, 0, 0.003), 0.002)
        cover.rotation_euler = (0, side * math.radians(-4), 0)
        parts.append(cover)
        page = plane(f"Page{'L' if side < 0 else 'R'}", 0.14, 0.2, (side * 0.074, 0, 0.0125), (0, side * math.radians(-4), 0))
        parts.append(page)
        stack = rounded_box(f"Stack{'L' if side < 0 else 'R'}", (0.14, 0.2, 0.006), (side * 0.074, 0, 0.0085), 0.001)
        stack.rotation_euler = (0, side * math.radians(-4), 0)
        parts.append(stack)
    # spiral rings along the spine
    for k in range(9):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.008, minor_radius=0.0016, location=(0, -0.09 + k * 0.0225, 0.012), rotation=(0, math.radians(90), 0))
        r = bpy.context.active_object
        r.name = f"Ring{k}"
        parts.append(r)
    # pencil lying across the right page
    pen = cylinder("Pencil", 0.0045, 0.16, (0.07, 0.0, 0.02), rot=(0, math.radians(90), math.radians(28)), verts=6)
    tip = bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.0045, radius2=0.0005, depth=0.018, location=(0, 0, 0))
    tip = bpy.context.active_object
    tip.name = "PencilTip"
    a = math.radians(28)
    tip.location = (0.07 + math.cos(a) * 0.089, 0.0 + math.sin(a) * 0.089, 0.02)
    tip.rotation_euler = (0, math.radians(90), a)
    parts += [pen, tip]
    return group("Sketchbook", parts)


def preview(path):
    sc = bpy.context.scene
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    cam.location = (0.0, -1.1, 0.55)
    cam.rotation_euler = (math.radians(62), 0, 0)
    cam.data.lens = 38
    sc.camera = cam
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(45), 0, math.radians(-30))
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
    laptop, camera, book = build_laptop(), build_camera(), build_sketchbook()
    laptop.location.x, camera.location.x, book.location.x = -0.38, 0.0, 0.36
    preview(os.path.join(OUT, "tools_preview.png"))
    models = os.path.join(OUT, "..", "public", "models")
    for root, name in ((laptop, "laptop"), (camera, "camera"), (book, "sketchbook")):
        root.location.x = 0
        export_root(root, os.path.join(models, f"{name}.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "tools.blend"))
    print("TOOLS_OK", sorted(o.name for o in bpy.data.objects if o.type == "MESH"))
