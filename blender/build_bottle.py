"""Build the original liqueur bottle used by the web scenes.

Run headless:
  blender --background --factory-startup --python build_bottle.py -- <out_dir>

Produces <out_dir>/bottle.blend, <out_dir>/../public/models/bottle.glb and a preview PNG.
All parts are lathed from 2D profiles (metres, Z up) so UVs are clean:
  Glass  - outer surface, u = around, v = bottom->top
  Liquid - inner volume with a flat meniscus at FILL height
  Label  - open band just outside the body, u 0..1 around (front at u = 0.5)
  Cap    - fluted screw cap
"""
import bpy, bmesh, math, os, sys

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.dirname(__file__)
SEG = 96          # segments around
H = 0.30          # total glass height (without cap)
R = 0.042         # body radius
THICK = 0.0035    # glass wall thickness
FILL = 0.78       # liquid fill as fraction of body height

# Outer glass profile (radius, z). Rounded base, straight body, soft shoulder, neck with lip ring.
def glass_profile():
    pts = []
    # rounded base edge (quarter circle, radius 0.008)
    rb = 0.008
    for i in range(0, 7):
        a = -math.pi / 2 + (math.pi / 2) * i / 6
        pts.append((R - rb + rb * math.cos(a), rb + rb * math.sin(a)))
    # straight body
    body_top = 0.19
    for i in range(1, 9):
        pts.append((R, rb + (body_top - rb) * i / 8))
    # shoulder: ease from R down to neck radius
    rn, sh_top = 0.0135, 0.245
    for i in range(1, 15):
        t = i / 14
        e = 0.5 - 0.5 * math.cos(math.pi * t)
        pts.append((R + (rn - R) * e, body_top + (sh_top - body_top) * t))
    # neck
    pts.append((rn, 0.262))
    # lip ring
    pts += [(rn + 0.0018, 0.264), (rn + 0.0024, 0.267), (rn + 0.0018, 0.270), (rn, 0.272)]
    pts.append((rn, H - 0.004))
    pts.append((rn - 0.001, H))
    return pts

def lathe(name, profile, seg=SEG, close_bottom=True, close_top=False, radial_fn=None):
    """Revolve profile around Z. radial_fn(r, angle, z) lets the cap add fluting."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    # arc length for v
    L = [0.0]
    for i in range(1, len(profile)):
        (r0, z0), (r1, z1) = profile[i - 1], profile[i]
        L.append(L[-1] + math.hypot(r1 - r0, z1 - z0))
    total = L[-1] or 1.0
    rings = []
    for (r, z) in profile:
        ring = []
        for s in range(seg):
            a = 2 * math.pi * s / seg
            rr = radial_fn(r, a, z) if radial_fn else r
            # angle 0 points to -Y so u = 0.5 faces +Y (front after glTF Y-up export faces +Z... see README)
            ring.append(bm.verts.new((rr * math.sin(a), -rr * math.cos(a), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(seg):
            s2 = (s + 1) % seg
            f = bm.faces.new((rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]))
            us = [s / seg, (s + 1) / seg, (s + 1) / seg, s / seg]
            vs = [L[i] / total, L[i] / total, L[i + 1] / total, L[i + 1] / total]
            for loop, u, v in zip(f.loops, us, vs):
                loop[uv].uv = (u, v)
    def cap_ring(ring, z, flip):
        c = bm.verts.new((0, 0, z))
        for s in range(seg):
            s2 = (s + 1) % seg
            vs = (ring[s2], ring[s], c) if not flip else (ring[s], ring[s2], c)
            f = bm.faces.new(vs)
            for loop in f.loops:
                p = loop.vert.co
                loop[uv].uv = (0.5 + p.x / (2 * R), 0.5 + p.y / (2 * R))
    if close_bottom:
        cap_ring(rings[0], profile[0][1], False)
    if close_top:
        cap_ring(rings[-1], profile[-1][1], True)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def material(name, rgba, rough, metal=0.0, transmission=0.0, ior=1.45, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = ior
    b.inputs["Alpha"].default_value = alpha
    return m

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"

    gp = glass_profile()
    # start the outer profile at the axis so the base is closed by the lathe itself
    glass = lathe("Glass", gp, close_bottom=True, close_top=False)
    glass.data.materials.append(material("GlassMat", (0.95, 0.97, 1.0, 1), 0.04, transmission=1.0, ior=1.5, alpha=0.25))

    # Liquid: shrink the body part of the profile by the wall thickness, clip at fill height
    fill_z = 0.006 + (0.245 - 0.006) * FILL
    lp = []
    for (r, z) in gp:
        if z < 0.004 or z > fill_z:
            continue
        lp.append((max(r - THICK, 0.001), z + 0.002))
    lp.append((lp[-1][0], fill_z))
    liquid = lathe("Liquid", lp, close_bottom=True, close_top=True)
    liquid.data.materials.append(material("LiquidMat", (0.45, 0.05, 0.08, 1), 0.08, transmission=0.6, ior=1.36))

    # Label band: open cylinder slightly outside the straight body
    lab = [(R + 0.0006, 0.045), (R + 0.0006, 0.165)]
    label = lathe("Label", [(lab[0][0], lab[0][1] + (lab[1][1] - lab[0][1]) * i / 12) for i in range(13)], close_bottom=False)
    label.data.materials.append(material("LabelMat", (0.9, 0.85, 0.75, 1), 0.6))

    # Cap: fluted cylinder with a chamfered top, sits over the neck
    cr, cz0, cz1 = 0.0175, 0.252, 0.312
    cp = [(0.0001, cz0), (cr - 0.001, cz0), (cr, cz0 + 0.001)]
    cp += [(cr, cz0 + (cz1 - cz0 - 0.004) * i / 10) for i in range(1, 11)]
    cp += [(cr - 0.002, cz1), (cr - 0.004, cz1 + 0.0008)]
    cap = lathe("Cap", cp, close_bottom=False, close_top=True,
                radial_fn=lambda r, a, z: r + (0.0007 * (0.5 + 0.5 * math.cos(a * 30)) if cz0 + 0.003 < z < cz1 - 0.003 else 0))
    cap.data.materials.append(material("CapMat", (0.75, 0.62, 0.38, 1), 0.28, metal=1.0))

    for ob in (glass, liquid, label, cap):
        ob.select_set(True)
    return sc

def preview(sc, path):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = (0.0, -0.95, 0.19)
    cam.rotation_euler = (math.radians(88), 0, 0)
    sc.camera = cam
    for loc, energy in (((0.4, -0.5, 0.6), 60), ((-0.5, -0.3, 0.3), 25), ((0.0, 0.6, 0.4), 40)):
        ld = bpy.data.lights.new("L", "AREA")
        ld.energy = energy
        ld.size = 0.4
        lo = bpy.data.objects.new("L", ld)
        lo.location = loc
        lo.rotation_euler = (math.atan2(math.hypot(loc[0], loc[1]), loc[2]) * 0 + math.radians(60), 0, math.atan2(loc[0], -loc[1]))
        sc.collection.objects.link(lo)
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.04, 0.05, 1)
    sc.world = world
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 600, 900
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # keep helper objects out of the export
    for ob in list(sc.collection.objects):
        if ob.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(ob)

if __name__ == "__main__":
    sc = build()
    os.makedirs(OUT, exist_ok=True)
    preview(sc, os.path.join(OUT, "bottle_preview.png"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "bottle.blend"))
    glb_dir = os.path.join(OUT, "..", "public", "models")
    os.makedirs(glb_dir, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(glb_dir, "bottle.glb"), export_format="GLB",
                              use_selection=False, export_apply=True, export_yup=True)
    stats = {ob.name: (len(ob.data.vertices), [round(v, 4) for v in ob.dimensions]) for ob in bpy.data.objects if ob.type == "MESH"}
    print("BOTTLE_STATS", stats)
