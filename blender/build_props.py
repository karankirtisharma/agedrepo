"""Build the original story props: the hooded Wanderer, a cocktail glass and a shaker.

Run headless:
  blender --background --factory-startup --python build_props.py -- <out_dir>

Writes figure.glb, cocktail_glass.glb and shaker.glb to <out_dir>/../public/models
plus a preview render. The Wanderer is a deliberately simple, faceless hooded
silhouette: robe, hood, shoulders and two separate arms (ArmL / ArmR) so the web
scenes can pose the arms (raise a hand, pour, drink) without a rig.
"""
import bpy, bmesh, math, os, sys, random

sys.path.append(os.path.dirname(__file__))
from build_bottle import lathe, material  # reuse the profile lathe

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.dirname(__file__)
random.seed(7)

def wobble(seed, amp, freq):
    """Deterministic hand-drawn wobble for robe hems and hood edges."""
    rnd = random.Random(seed)
    phases = [rnd.uniform(0, 6.28) for _ in range(3)]
    return lambda r, a, z: r + amp * (math.sin(a * freq + phases[0]) * 0.6 + math.sin(a * (freq * 2 + 1) + phases[1]) * 0.3
                                      + math.sin(a * 3 + phases[2]) * 0.4) * max(0.0, 1 - z / 1.0)

def figure():
    # Units: metres, figure ~1.78 m tall, feet at z = 0, facing -Y
    robe_prof = [(0.0001, 0.0), (0.34, 0.0), (0.335, 0.05), (0.30, 0.30), (0.26, 0.60), (0.23, 0.90),
                 (0.215, 1.10), (0.23, 1.30), (0.24, 1.40), (0.20, 1.46), (0.12, 1.50), (0.0001, 1.51)]
    robe = lathe("Robe", robe_prof, seg=48, close_bottom=False, radial_fn=wobble(1, 0.025, 7))
    robe.scale = (1.0, 0.72, 1.0)  # flatten front-to-back so it reads as cloth, not a cone

    hood_prof = [(0.0001, 1.40), (0.13, 1.42), (0.155, 1.52), (0.16, 1.62), (0.14, 1.72), (0.09, 1.79), (0.0001, 1.81)]
    hood = lathe("Hood", hood_prof, seg=40, close_bottom=False, radial_fn=wobble(2, 0.008, 5))
    hood.scale = (1.0, 1.12, 1.0)
    hood.location = (0, 0.015, 0)

    # Dark face opening: a flattened disc set into the hood front
    face = lathe("FaceShadow", [(0.0001, 0.0), (0.085, 0.0), (0.0001, 0.001)], seg=32, close_bottom=False)
    face.rotation_euler = (math.radians(90), 0, 0)
    face.scale = (1.0, 1.35, 1.0)
    face.location = (0, -0.172, 1.60)

    arms = []
    for side, name in ((-1, "ArmL"), (1, "ArmR")):
        # Sleeve hangs from the shoulder along -Z; pivot (origin) sits at the shoulder
        sleeve_prof = [(0.0001, 0.0), (0.075, -0.02), (0.08, -0.25), (0.095, -0.55), (0.10, -0.62), (0.0001, -0.63)]
        arm = lathe(name, sleeve_prof, seg=24, close_bottom=False, radial_fn=lambda r, a, z: r)
        hand = lathe(name + "Hand", [(0.0001, -0.63), (0.04, -0.64), (0.045, -0.70), (0.03, -0.75), (0.0001, -0.76)], seg=16)
        hand.parent = arm
        arm.location = (side * 0.22, 0.0, 1.40)
        arm.rotation_euler = (0, side * math.radians(8), 0)
        arms.append(arm)

    robe_mat = material("Robe", (0.55, 0.42, 0.28, 1), 0.9)
    dark = material("Shadow", (0.02, 0.02, 0.03, 1), 1.0)
    skin = material("Skin", (0.85, 0.72, 0.6, 1), 0.7)
    for ob in (robe, hood, *arms):
        ob.data.materials.append(robe_mat)
    face.data.materials.append(dark)
    for arm in arms:
        arm.children[0].data.materials.append(skin)
    root = bpy.data.objects.new("Wanderer", None)
    bpy.context.collection.objects.link(root)
    for ob in (robe, hood, face, *arms):
        ob.parent = root
    return root

def cocktail_glass():
    # Coupe-style glass, 0.17 m tall: foot, stem, wide shallow bowl
    prof = [(0.0001, 0.0), (0.045, 0.0), (0.046, 0.003), (0.012, 0.008), (0.006, 0.02), (0.005, 0.09),
            (0.009, 0.10), (0.04, 0.115), (0.062, 0.135), (0.07, 0.155), (0.072, 0.17)]
    g = lathe("CocktailGlass", prof, seg=64, close_bottom=True)
    g.data.materials.append(material("GlassMat", (0.95, 0.97, 1.0, 1), 0.04, transmission=1.0, ior=1.5))
    # Drink surface the web scene scales up while pouring
    drink = lathe("Drink", [(0.0001, 0.103), (0.036, 0.113), (0.058, 0.131), (0.066, 0.15), (0.0001, 0.150)], seg=64, close_bottom=False)
    drink.data.materials.append(material("DrinkMat", (0.3, 0.6, 0.95, 1), 0.1))
    return g

def shaker():
    # Three-piece cobbler shaker, 0.26 m tall
    prof = [(0.0001, 0.0), (0.042, 0.0), (0.044, 0.004), (0.046, 0.15), (0.044, 0.16), (0.036, 0.19),
            (0.030, 0.205), (0.031, 0.215), (0.022, 0.235), (0.012, 0.245), (0.013, 0.252), (0.009, 0.262), (0.0001, 0.263)]
    s = lathe("Shaker", prof, seg=64, close_bottom=True, close_top=False)
    s.data.materials.append(material("Steel", (0.8, 0.82, 0.85, 1), 0.22, metal=1.0))
    return s

def export(objs_root_names, path):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.data.objects:
        top = ob
        while top.parent:
            top = top.parent
        ob.select_set(top.name in objs_root_names)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)

def preview(path):
    sc = bpy.context.scene
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    cam.location = (0.35, -4.2, 1.0)
    cam.rotation_euler = (math.radians(86), 0, 0)
    cam.data.lens = 45
    sc.camera = cam
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    sc.collection.objects.link(sun)
    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.92, 0.9, 0.86, 1)
    sc.world = w
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 900, 700
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)

if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fig = figure()
    g = cocktail_glass()
    g.location = (0.75, 0, 0)
    for ob in bpy.data.objects:
        if ob.name == "Drink":
            ob.parent = g
    sh = shaker()
    sh.location = (1.1, 0, 0)
    preview(os.path.join(OUT, "props_preview.png"))
    models = os.path.join(OUT, "..", "public", "models")
    os.makedirs(models, exist_ok=True)
    # Export each prop at the origin
    g.location = sh.location = (0, 0, 0)
    export({"Wanderer"}, os.path.join(models, "figure.glb"))
    export({"CocktailGlass"}, os.path.join(models, "cocktail_glass.glb"))
    export({"Shaker"}, os.path.join(models, "shaker.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "props.blend"))
    print("PROPS_OK", sorted(o.name for o in bpy.data.objects))
