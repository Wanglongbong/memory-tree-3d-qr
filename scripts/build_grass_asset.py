"""Run with Blender --background --python scripts/build_grass_asset.py.

Original folded grass blade. Reference: https://www.rhs.org.uk/plants/119102/poa-annua/details
No reference photo is redistributed. Web geometry uses Y-up; Blender uses Z-up.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parent.parent
target = root / "assets/starter/src/assets/grass-blade.json"
target.parent.mkdir(parents=True, exist_ok=True)
authoring = root / "assets/blender"
authoring.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

vertices, faces = [], []
for row in range(8):
    t = row / 7
    width = 0.067 * (math.sin(math.pi * t) ** 0.7 * 0.8 + (1 - t) * 0.2)
    bow = 0.04 * t * t
    for across in (-1, 0, 1):
        vertices.append((bow + across * width, 0.013 * (1 - abs(across)) * math.sin(math.pi * t), t))
for row in range(7):
    for col in range(2):
        a = row * 3 + col
        faces.append((a, a + 1, a + 4, a + 3))
mesh = bpy.data.meshes.new("Folded tapered leaf — 28 triangles")
mesh.from_pydata(vertices, [], faces)
mesh.update()
mesh.calc_loop_triangles()
data = {
    "generator": "Blender 5.1 / scripts/build_grass_asset.py",
    "positions": [round(v, 7) for vert in mesh.vertices for v in (vert.co.x, vert.co.z, -vert.co.y)],
    "indices": [i for triangle in mesh.loop_triangles for i in triangle.vertices],
}
target.write_text(json.dumps(data, separators=(",", ":")) + "\n")

colors = [(0.16, 0.27, 0.055, 1), (0.23, 0.36, 0.075, 1), (0.31, 0.43, 0.12, 1)]
materials = []
for i, color in enumerate(colors):
    mat = bpy.data.materials.new(f"Meadow green {i + 1}")
    mat.diffuse_color = color
    mat.use_nodes = True
    mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = color
    mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.86
    materials.append(mat)
for i in range(11):
    leaf = bpy.data.objects.new(f"Grass blade {i + 1:02}", mesh.copy())
    bpy.context.collection.objects.link(leaf)
    angle = i * 2.39996
    leaf.location = (math.cos(angle) * 0.09, math.sin(angle) * 0.09, 0)
    leaf.rotation_euler = (0.12 + (i % 4) * 0.14, 0, angle)
    leaf.scale = (1, 1, 0.58 + (i % 7) * 0.135)
    leaf.data.materials.append(materials[i % 3])
    if i >= 5:
        for vertex in leaf.data.vertices:
            vertex.co.x += vertex.co.z ** 1.8 * (0.30 + 0.23 * math.sin(angle))
    wind = leaf.modifiers.new("Gentle wind preview", "SIMPLE_DEFORM")
    wind.deform_method = "BEND"
    wind.deform_axis = "X"
    for frame, amount in [(1, -0.08), (45, 0.12), (90, -0.04), (135, -0.08)]:
        wind.angle = amount * (0.7 + (i % 3) * 0.15)
        wind.keyframe_insert(data_path="angle", frame=frame + i * 2)

bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.48, depth=0.08, location=(0, 0, -0.045))
soil = bpy.context.object
soil.name = "Soil sample — preview only"
mat = bpy.data.materials.new("Warm earth")
mat.diffuse_color = (0.19, 0.105, 0.045, 1)
mat.use_nodes = True
mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = mat.diffuse_color
mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.95
soil.data.materials.append(mat)
bpy.ops.object.camera_add(location=(2.1, -3.3, 1.8))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0.58)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.95
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.world.color = (0.24, 0.24, 0.24)
bpy.ops.object.light_add(type="AREA", location=(1.5, -2, 3))
bpy.context.object.data.energy = 170
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 3
scene.frame_end = 135
scene.frame_set(25)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(authoring / "meadow-grass.blend"))
scene.render.filepath = str(authoring / "meadow-grass-preview.png")
bpy.ops.render.render(write_still=True)
print(f"Grass exported: {len(mesh.vertices)} vertices / {len(mesh.loop_triangles)} triangles")
