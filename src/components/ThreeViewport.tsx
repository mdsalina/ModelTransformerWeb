import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { JsonModelData, FiltersState } from '../types';

interface ThreeViewportProps {
  modelData: JsonModelData | null;
  filters: FiltersState;
  showGrids?: boolean;
  activeStep?: 'filters' | 'process' | 'export';
  processTranslation?: { dx: number; dy: number; dz: number; alpha: number };
}

export const ThreeViewport = ({
  modelData,
  filters,
  showGrids = true,
  activeStep = 'filters',
  processTranslation = { dx: 0, dy: 0, dz: 0, alpha: 0 }
}: ThreeViewportProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const hasFitCameraRef = useRef<boolean>(false);
  const targetCameraPosition = useRef<THREE.Vector3 | null>(null);

  const [sceneInstance, setSceneInstance] = useState<THREE.Scene | null>(null);
  const [cubeTransform, setCubeTransform] = useState('rotateX(0deg) rotateY(0deg)');
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [renderedCounts, setRenderedCounts] = useState({ walls: 0, beams: 0, slabs: 0 });
  const [errorLog, setErrorLog] = useState<string | null>(null);

  // Reset fit-camera ref when modelData changes
  useEffect(() => {
    hasFitCameraRef.current = false;
  }, [modelData]);

  useEffect(() => {
    if (!mountRef.current) return;

    let animationId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let controls: OrbitControls | null = null;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      // 1. Create Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xd9d9e5); // surface_dim (#d9d9e5) from Stitch theme
      sceneRef.current = scene;

      // 2. Create Camera
      const width = mountRef.current.clientWidth || 800;
      const height = mountRef.current.clientHeight || 500;
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
      camera.position.set(40, 30, 40);
      cameraRef.current = camera;

      // 3. Create Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      
      // Ensure canvas element styles are set for absolute overlay and events
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.top = '0';
      renderer.domElement.style.left = '0';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.touchAction = 'none';
      renderer.domElement.style.pointerEvents = 'auto';
      
      mountRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // 4. Create Controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 + 0.1; // don't go too far below ground
      controlsRef.current = controls;

      // 5. Add Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(40, 100, 20);
      dirLight.castShadow = true;
      scene.add(dirLight);

      const dirLight2 = new THREE.DirectionalLight(0xb4c5ff, 0.4);
      dirLight2.position.set(-40, 30, -20);
      scene.add(dirLight2);

      // 6. Draw structural axes helper at base
      const axesHelper = new THREE.AxesHelper(5);
      scene.add(axesHelper);

      // 7. Grid ground helper
      const gridHelper = new THREE.GridHelper(100, 50, 0x004ac6, 0xc3c6d7);
      gridHelper.position.y = -0.01;
      scene.add(gridHelper);

      // Set scene instance to trigger geometry effect
      setSceneInstance(scene);

      // Render loop
      const animate = () => {
        animationId = requestAnimationFrame(animate);

        if (camera && controls && renderer) {
          // Camera position smooth interpolation for navigation cube face clicks
          if (targetCameraPosition.current) {
            camera.position.lerp(targetCameraPosition.current, 0.15);
            if (camera.position.distanceTo(targetCameraPosition.current) < 0.01) {
              camera.position.copy(targetCameraPosition.current);
              targetCameraPosition.current = null;
            }
            controls.update();
          }

          // Calculate spherical pitch & yaw to rotate CSS viewcube in sync
          const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);
          const len = offset.length();
          if (len > 0) {
            const theta = Math.atan2(offset.x, offset.z); // yaw
            const phi = Math.acos(Math.min(Math.max(offset.y / len, -1), 1)); // pitch
            
            const pitchDeg = 90 - (phi * 180) / Math.PI;
            const yawDeg = -(theta * 180) / Math.PI;
            setCubeTransform(`rotateX(${pitchDeg}deg) rotateY(${yawDeg}deg)`);
          }

          // Rotate the test shape if present
          const testMesh = scene.getObjectByName('test_mode_shape');
          if (testMesh) {
            testMesh.rotation.x += 0.01;
            testMesh.rotation.y += 0.015;
          }

          controls.update();
          renderer.render(scene, camera);
        }
      };
      animate();

      // Resize handler using ResizeObserver
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          setViewportSize({ width: Math.round(w), height: Math.round(h) });
          if (w > 0 && h > 0) {
            if (cameraRef.current) {
              cameraRef.current.aspect = w / h;
              cameraRef.current.updateProjectionMatrix();
            }
            if (rendererRef.current) {
              rendererRef.current.setSize(w, h);
            }
          }
        }
      });
      resizeObserver.observe(mountRef.current);

    } catch (e: any) {
      console.error('Three.js Init Error:', e);
      setErrorLog('Init Error: ' + (e.message || String(e)));
    }

    return () => {
      cancelAnimationFrame(animationId);
      if (resizeObserver) resizeObserver.disconnect();
      if (controls) (controls as any).dispose();
      
      setSceneInstance(null);
      
      if (renderer && renderer.domElement && mountRef.current) {
        try {
          mountRef.current.removeChild(renderer.domElement);
        } catch (e) {
          // ignore
        }
      }
      if (renderer) renderer.dispose();
    };
  }, []);

  // Update geometry when sceneInstance, modelData, filters or transformations change
  useEffect(() => {
    const scene = sceneInstance;
    if (!scene) return;

    let wallsCount = 0;
    let beamsCount = 0;
    let slabsCount = 0;
    setErrorLog(null);

    try {
      // Clean up previous elements
      const toRemove: THREE.Object3D[] = [];
      scene.traverse((obj: THREE.Object3D) => {
        if (obj.name === 'bim_model_element') {
          toRemove.push(obj);
        }
      });
      toRemove.forEach((obj) => {
        scene.remove(obj);
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      });

      // Create a group container for current model elements
      const modelGroup = new THREE.Group();
      modelGroup.name = 'bim_model_element';
      scene.add(modelGroup);

      // Render simple test mode shape if active (for debugging view/interaction)
      if (filters.testMode) {
        try {
          const testGeo = new THREE.TorusKnotGeometry(3, 0.8, 64, 8);
          const testMat = new THREE.MeshNormalMaterial();
          const testMesh = new THREE.Mesh(testGeo, testMat);
          testMesh.name = 'test_mode_shape';
          testMesh.position.set(0, 4, 0); // elevated above ground grid
          modelGroup.add(testMesh);
        } catch (e: any) {
          console.error('Error drawing test shape:', e);
        }
      }

      if (modelData) {
        // Setup translation matrices for the "process" step if enabled
        const tx = activeStep === 'process' ? processTranslation.dx : 0;
        const ty = activeStep === 'process' ? processTranslation.dy : 0;
        const tz = activeStep === 'process' ? processTranslation.dz : 0;
        const rotAlpha = activeStep === 'process' ? (processTranslation.alpha * Math.PI) / 180 : 0;

        // Convert coordinates:
        // JSON Z is up elevation -> maps to Three.js Y
        // JSON Y is plan north-south -> maps to Three.js Z
        // JSON X is plan east-west -> maps to Three.js X
        const convertCoords = (x: number, y: number, z: number): THREE.Vector3 => {
          // Apply rotation around Z-axis (which is vertical in JSON coordinate system, mapping to Three.js Y-axis)
          let rx = x;
          let ry = y;
          if (rotAlpha !== 0) {
            rx = x * Math.cos(rotAlpha) - y * Math.sin(rotAlpha);
            ry = x * Math.sin(rotAlpha) + y * Math.cos(rotAlpha);
          }
          return new THREE.Vector3(rx + tx, z + tz, ry + ty);
        };

        // 1. Draw Grids
        if (showGrids && filters.elements.grillas && modelData.grids) {
          try {
            const gridMaterial = new THREE.LineBasicMaterial({ color: 0x737686, linewidth: 1 });
            modelData.grids.forEach((grid) => {
              const p1 = convertCoords(grid.p1[0], grid.p1[1], 0);
              const p2 = convertCoords(grid.p2[0], grid.p2[1], 0);
              const points = [p1, p2];
              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.Line(geometry, gridMaterial);
              modelGroup.add(line);
            });
          } catch (e) {
            console.error('Error drawing grids:', e);
          }
        }

        // Map checked levels for fast lookup
        const checkedLevels = new Set(
          filters.levels.filter((l) => l.checked).map((l) => l.id)
        );

        // 2. Draw Walls
        if (filters.elements.muros && modelData.elements.walls) {
          const checkedWallsSecs = new Set(
            filters.walls.filter((s) => s.checked).map((s) => s.name)
          );

          modelData.elements.walls.forEach((wall) => {
            try {
              // Filter by Level
              if (!checkedLevels.has(wall.level)) return;

              // Filter by Section checked state
              if (!checkedWallsSecs.has(wall.section)) return;

              // Filter by Section parameters (Thickness check)
              const wallSec = modelData.sections.find(s => s.code_name === wall.section);
              if (wallSec) {
                const thickness = (wallSec.parameters.thickness || 0.2) * 1000;
                if (thickness < filters.thickness.walls.min || thickness > filters.thickness.walls.max) {
                  return;
                }
              }

              const outline = wall.location.outline;
              if (outline && outline.length >= 4) {
                // Typically vertical quadrilaterals: v0, v1, v2, v3
                const p0 = convertCoords(outline[0][0], outline[0][1], outline[0][2]);
                const p1 = convertCoords(outline[1][0], outline[1][1], outline[1][2]);
                const p2 = convertCoords(outline[2][0], outline[2][1], outline[2][2]);
                const p3 = convertCoords(outline[3][0], outline[3][1], outline[3][2]);

                const vertices = new Float32Array([
                  p0.x, p0.y, p0.z,
                  p1.x, p1.y, p1.z,
                  p2.x, p2.y, p2.z,
                  p3.x, p3.y, p3.z,
                ]);

                const indices = [
                  0, 1, 2,
                  0, 2, 3
                ];

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                geometry.setIndex(indices);
                geometry.computeVertexNormals();

                // Elegant semi-transparent blue for walls
                const material = new THREE.MeshStandardMaterial({
                  color: activeStep === 'export' ? 0x2563eb : 0x004ac6,
                  transparent: true,
                  opacity: 0.65,
                  side: THREE.DoubleSide,
                  roughness: 0.4,
                  metalness: 0.1
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                modelGroup.add(mesh);
                wallsCount++;
              }
            } catch (e) {
              console.error('Error drawing wall:', wall, e);
            }
          });
        }

        // 3. Draw Beams
        if (filters.elements.vigas && modelData.elements.beams) {
          const checkedBeamsSecs = new Set(
            filters.beams.filter((s) => s.checked).map((s) => s.name)
          );

          modelData.elements.beams.forEach((beam) => {
            try {
              if (!checkedLevels.has(beam.level)) return;
              if (!checkedBeamsSecs.has(beam.section)) return;

              // Filter by Thickness width
              const beamSec = modelData.sections.find(s => s.code_name === beam.section);
              if (beamSec) {
                const thickness = (beamSec.parameters.width || 0.2) * 1000;
                if (thickness < filters.thickness.beams.min || thickness > filters.thickness.beams.max) {
                  return;
                }
              }

              const start = beam.location.start;
              const end = beam.location.end;
              if (start && end) {
                const pStart = convertCoords(start[0], start[1], start[2]);
                const pEnd = convertCoords(end[0], end[1], end[2]);

                // Render beams as cylinders stretched between two points
                const distance = pStart.distanceTo(pEnd);
                const thickness = beamSec ? (beamSec.parameters.width || 0.2) : 0.2;
                const height = beamSec ? (beamSec.parameters.height || 0.4) : 0.4;
                
                // Draw a box geometry connecting them
                const beamGeo = new THREE.BoxGeometry(thickness, height, distance);
                
                const beamMat = new THREE.MeshStandardMaterial({
                  color: activeStep === 'export' ? 0xacbfff : 0x495c95,
                  roughness: 0.5,
                  metalness: 0.2
                });

                const beamMesh = new THREE.Mesh(beamGeo, beamMat);
                beamMesh.position.copy(pStart).add(pEnd).multiplyScalar(0.5);
                
                // Orient beam mesh to face pEnd from pStart
                beamMesh.lookAt(pEnd);
                beamMesh.castShadow = true;
                beamMesh.receiveShadow = true;
                modelGroup.add(beamMesh);
                beamsCount++;
              }
            } catch (e) {
              console.error('Error drawing beam:', beam, e);
            }
          });
        }

        // 4. Draw Slabs
        if (filters.elements.losas && modelData.elements.slabs) {
          const checkedSlabsSecs = new Set(
            filters.slabs.filter((s) => s.checked).map((s) => s.name)
          );

          modelData.elements.slabs.forEach((slab) => {
            try {
              if (!checkedLevels.has(slab.level)) return;
              if (!checkedSlabsSecs.has(slab.section)) return;

              const slabSec = modelData.sections.find(s => s.code_name === slab.section);
              if (slabSec) {
                const thickness = (slabSec.parameters.thickness || 0.15) * 1000;
                if (thickness < filters.thickness.slabs.min || thickness > filters.thickness.slabs.max) {
                  return;
                }
              }

              const outline = slab.location.outline;
              if (outline && outline.length >= 3) {
                // Flatten vertices to 2D shape on XY coordinates (using Three.js coordinate mapping)
                const shape = new THREE.Shape();
                const p0 = outline[0];
                shape.moveTo(p0[0], p0[1]);

                for (let i = 1; i < outline.length; i++) {
                  shape.lineTo(outline[i][0], outline[i][1]);
                }
                shape.closePath();

                // Add openings
                if (slab.location.openings) {
                  slab.location.openings.forEach((op) => {
                    if (op.outline && op.outline.length >= 3) {
                      const holePath = new THREE.Path();
                      holePath.moveTo(op.outline[0][0], op.outline[0][1]);
                      for (let i = 1; i < op.outline.length; i++) {
                        holePath.lineTo(op.outline[i][0], op.outline[i][1]);
                      }
                      holePath.closePath();
                      shape.holes.push(holePath);
                    }
                  });
                }

                // Extrude or flat shape geometry
                const slabThickness = slabSec ? (slabSec.parameters.thickness || 0.15) : 0.15;
                const extrudeSettings = {
                  depth: -slabThickness,
                  bevelEnabled: false,
                };

                const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                // Rotate shape geometry so XY horizontal plane matches Three.js XZ plane
                geometry.rotateX(-Math.PI / 2);

                const material = new THREE.MeshStandardMaterial({
                  color: activeStep === 'export' ? 0xeeefff : 0xacbfff,
                  transparent: true,
                  opacity: 0.45,
                  side: THREE.DoubleSide,
                  roughness: 0.6
                });

                const mesh = new THREE.Mesh(geometry, material);
                
                // Elevate slab to its level Z coordinate (mapped to Three.js Y)
                const elevation = p0[2] + tz;
                mesh.position.set(tx, elevation, ty);
                
                // Apply rotation to slab mesh if process rotation is set
                if (rotAlpha !== 0) {
                  mesh.rotation.y = rotAlpha;
                }
                mesh.receiveShadow = true;
                modelGroup.add(mesh);
                slabsCount++;
              }
            } catch (e) {
              console.error('Error drawing slab:', slab, e);
            }
          });
        }
      }

      // Auto-fit camera around model boundaries on first load
      if (modelGroup.children.length > 0 && !hasFitCameraRef.current) {
        const bbox = new THREE.Box3().setFromObject(modelGroup);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const camera = cameraRef.current;
        const controls = controlsRef.current;

        if (camera && controls && maxDim > 0) {
          // Adjust controls target to model center
          controls.target.copy(center);
          
          // Calculate appropriate camera position based on bounding box
          const fov = camera.fov * (Math.PI / 180);
          let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
          cameraZ *= 1.5; // add buffer

          camera.position.set(center.x + cameraZ * 0.8, center.y + cameraZ * 0.6, center.z + cameraZ * 0.8);
          camera.lookAt(center);
          controls.update();
          hasFitCameraRef.current = true;
        }
      }

      setRenderedCounts({ walls: wallsCount, beams: beamsCount, slabs: slabsCount });
    } catch (err: any) {
      console.error('Geometry update error:', err);
      setErrorLog(err.message || String(err));
    }
  }, [sceneInstance, modelData, filters, showGrids, activeStep, processTranslation]);

  const handleFaceClick = (face: string) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = controls.target;
    // Calculate spherical radius from target to camera
    const radius = Math.max(camera.position.distanceTo(target), 10);

    const targetPos = new THREE.Vector3();
    switch (face) {
      case 'top':
        targetPos.set(target.x, target.y + radius, target.z);
        break;
      case 'bottom':
        targetPos.set(target.x, target.y - radius, target.z);
        break;
      case 'front':
        targetPos.set(target.x, target.y, target.z + radius);
        break;
      case 'back':
        targetPos.set(target.x, target.y, target.z - radius);
        break;
      case 'left':
        targetPos.set(target.x - radius, target.y, target.z);
        break;
      case 'right':
        targetPos.set(target.x + radius, target.y, target.z);
        break;
      default:
        return;
    }
    
    targetCameraPosition.current = targetPos;
  };

  return (
    <div ref={mountRef} className="absolute inset-0 w-full h-full rounded-xl overflow-hidden">
      
      {/* Styles for Navigation Cube */}
      <style dangerouslySetInnerHTML={{__html: `
        .cube-wrapper {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 100;
          pointer-events: auto;
        }
        .cube-container {
          width: 60px;
          height: 60px;
          perspective: 200px;
          user-select: none;
        }
        .cube-3d {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
        }
        .cube-face {
          position: absolute;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Manrope', sans-serif;
          font-size: 9px;
          font-weight: 800;
          color: #004ac6;
          background: rgba(250, 248, 255, 0.85);
          border: 1.5px solid rgba(0, 74, 198, 0.4);
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(25, 27, 35, 0.08);
          transition: background-color 0.2s, color 0.2s, border-color 0.2s;
          cursor: pointer;
          backface-visibility: visible;
        }
        .cube-face:hover {
          background: #004ac6;
          color: #ffffff;
          border-color: #004ac6;
        }
        .cube-face.front  { transform: rotateY(0deg) translateZ(30px); }
        .cube-face.back   { transform: rotateY(180deg) translateZ(30px); }
        .cube-face.right  { transform: rotateY(90deg) translateZ(30px); }
        .cube-face.left   { transform: rotateY(-90deg) translateZ(30px); }
        .cube-face.top    { transform: rotateX(90deg) translateZ(30px); }
        .cube-face.bottom { transform: rotateX(-90deg) translateZ(30px); }
      `}} />

      {/* Interactive Navigation Cube */}
      <div className="cube-wrapper">
        <div className="cube-container">
          <div className="cube-3d" style={{ transform: cubeTransform }}>
            <div className="cube-face front" onClick={() => handleFaceClick('front')}>FRON</div>
            <div className="cube-face back" onClick={() => handleFaceClick('back')}>TRAS</div>
            <div className="cube-face left" onClick={() => handleFaceClick('left')}>IZQ</div>
            <div className="cube-face right" onClick={() => handleFaceClick('right')}>DER</div>
            <div className="cube-face top" onClick={() => handleFaceClick('top')}>SUP</div>
            <div className="cube-face bottom" onClick={() => handleFaceClick('bottom')}>INF</div>
          </div>
        </div>
      </div>

      {/* Floating Debug Panel */}
      <div className="absolute bottom-4 left-4 bg-black/85 text-white font-mono text-[10px] p-3 rounded-lg border border-white/20 z-50 pointer-events-none max-w-xs select-none shadow-xl">
        <h4 className="font-bold border-b border-white/20 pb-1 mb-1 text-primary-fixed">Three.js Viewport Debug</h4>
        <div>Size: {viewportSize.width}x{viewportSize.height}</div>
        <div>Model Loaded: {modelData ? 'Yes' : 'No'}</div>
        <div>Test Mode Active: {filters.testMode ? 'Yes' : 'No'}</div>
        {modelData && (
          <>
            <div>Total Walls: {modelData.elements.walls?.length || 0} (Rendered: {renderedCounts.walls})</div>
            <div>Total Beams: {modelData.elements.beams?.length || 0} (Rendered: {renderedCounts.beams})</div>
            <div>Total Slabs: {modelData.elements.slabs?.length || 0} (Rendered: {renderedCounts.slabs})</div>
            <div>Grids: {modelData.grids?.length || 0} (Visible: {showGrids && filters.elements.grillas ? 'Yes' : 'No'})</div>
            <div>Checked Levels: {filters.levels.filter(l => l.checked).length} / {filters.levels.length}</div>
          </>
        )}
        {errorLog && (
          <div className="mt-1 border-t border-red-500/50 pt-1 text-red-400 font-semibold max-h-24 overflow-y-auto">
            Error: {errorLog}
          </div>
        )}
      </div>
    </div>
  );
};
export default ThreeViewport;
