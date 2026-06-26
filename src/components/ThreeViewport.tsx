import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { JsonModelData, FiltersState } from '../types';

interface ThreeViewportProps {
  modelData: JsonModelData | null;
  filters: FiltersState;
  showGrids?: boolean;
  activeStep?: 'filters' | 'process' | 'export';
  processTranslation?: { dx: number; dy: number; dz: number; alpha: number };
  fileName?: string;
  hiddenElementIds: Set<string>;
  setHiddenElementIds: Dispatch<SetStateAction<Set<string>>>;
}

// Helper to calculate distance from a point (x, y) to an infinite line defined by grid (p1, p2)
const getDistanceToGridLine = (x: number, y: number, grid: { p1: [number, number]; p2: [number, number] }): number => {
  const dx = grid.p2[0] - grid.p1[0];
  const dy = grid.p2[1] - grid.p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return 0;
  const A = -dy / len;
  const B = dx / len;
  const C = -(A * grid.p1[0] + B * grid.p1[1]);
  return Math.abs(A * x + B * y + C);
};

// Helper to project point (x, y) onto grid line segment, returning parameter t (0 to 1)
const getGridProjectionT = (x: number, y: number, grid: { p1: [number, number]; p2: [number, number] }): number => {
  const dx = grid.p2[0] - grid.p1[0];
  const dy = grid.p2[1] - grid.p1[1];
  const denom = dx * dx + dy * dy;
  if (denom === 0) return 0;
  return ((x - grid.p1[0]) * dx + (y - grid.p1[1]) * dy) / denom;
};

// Helper to check if two intervals [a, b] and [c, d] overlap
const intervalsOverlap = (a: number, b: number, c: number, d: number): boolean => {
  return Math.max(a, c) <= Math.min(b, d);
};

// Helper to check if line segment p-q intersects segment r-s
const lineSegmentsIntersect = (
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number]
): boolean => {
  const det = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0]);
  if (det === 0) return false; // Parallel
  const t = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / det;
  const u = ((q1[0] - p1[0]) * (p2[1] - p1[1]) - (q1[1] - p1[1]) * (p2[0] - p1[0])) / det;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

// Helper to check if point is inside polygon (ray-casting algorithm)
const isPointInPolygon = (p: [number, number], polygon: [number, number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > p[1]) !== (yj > p[1]))
        && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export const ThreeViewport = ({
  modelData,
  filters,
  showGrids = true,
  activeStep = 'filters',
  processTranslation = { dx: 0, dy: 0, dz: 0, alpha: 0 },
  fileName,
  hiddenElementIds,
  setHiddenElementIds
}: ThreeViewportProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const activeCameraRef = useRef<THREE.Camera | null>(null);
  const hasFitCameraRef = useRef<boolean>(false);
  const targetCameraPosition = useRef<THREE.Vector3 | null>(null);

  const getModelDataBBox = (): { center: THREE.Vector3; maxDim: number } => {
    const bbox = new THREE.Box3();
    if (!modelData) return { center: new THREE.Vector3(0, 0, 0), maxDim: 40 };

    const tx = activeStep === 'process' ? processTranslation.dx : 0;
    const ty = activeStep === 'process' ? processTranslation.dy : 0;
    const tz = activeStep === 'process' ? processTranslation.dz : 0;
    const rotAlpha = activeStep === 'process' ? (processTranslation.alpha * Math.PI) / 180 : 0;

    const convertCoords = (x: number, y: number, z: number): THREE.Vector3 => {
      let rx = x;
      let ry = y;
      if (rotAlpha !== 0) {
        rx = x * Math.cos(rotAlpha) - y * Math.sin(rotAlpha);
        ry = x * Math.sin(rotAlpha) + y * Math.cos(rotAlpha);
      }
      return new THREE.Vector3(rx + tx, z + tz, -ry - ty);
    };

    let hasPoints = false;

    if (modelData.elements.walls) {
      modelData.elements.walls.forEach(wall => {
        if (wall.location.outline) {
          wall.location.outline.forEach(p => {
            bbox.expandByPoint(convertCoords(p[0], p[1], p[2]));
            bbox.expandByPoint(convertCoords(p[0], p[1], p[2] + wall.location.height));
            hasPoints = true;
          });
        }
      });
    }

    if (modelData.elements.beams) {
      modelData.elements.beams.forEach(beam => {
        if (beam.location.start) {
          bbox.expandByPoint(convertCoords(beam.location.start[0], beam.location.start[1], beam.location.start[2]));
          hasPoints = true;
        }
        if (beam.location.end) {
          bbox.expandByPoint(convertCoords(beam.location.end[0], beam.location.end[1], beam.location.end[2]));
          hasPoints = true;
        }
      });
    }

    if (modelData.elements.slabs) {
      modelData.elements.slabs.forEach(slab => {
        if (slab.location.outline) {
          slab.location.outline.forEach(p => {
            bbox.expandByPoint(convertCoords(p[0], p[1], p[2]));
            hasPoints = true;
          });
        }
      });
    }

    const center = new THREE.Vector3();
    let maxDim = 40;

    if (hasPoints) {
      bbox.getCenter(center);
      const size = bbox.getSize(new THREE.Vector3());
      maxDim = Math.max(size.x, size.y, size.z);
    }

    return { center, maxDim };
  };

  // Direct references to lights and grid helpers to guarantee toggling
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);

  const [sceneInstance, setSceneInstance] = useState<THREE.Scene | null>(null);
  const [cubeTransform, setCubeTransform] = useState('rotateX(0deg) rotateY(0deg)');
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [renderedCounts, setRenderedCounts] = useState({ walls: 0, beams: 0, slabs: 0 });
  const [errorLog, setErrorLog] = useState<string | null>(null);

  const [polygonCount, setPolygonCount] = useState<number>(0);

  // Viewport toggles state
  const [showGroundGrid, setShowGroundGrid] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [enableShadows, setEnableShadows] = useState(false);
  const [enableTransparency, setEnableTransparency] = useState(true);
  
  const [selectedLevelId, setSelectedLevelId] = useState<string>('3d');
  const [selectedGridName, setSelectedGridName] = useState<string>('none');
  const [selectedElements, setSelectedElements] = useState<{ id: string; type: 'wall' | 'beam' | 'slab'; data: any }[]>([]);
  const selectedElement = selectedElements[selectedElements.length - 1] || null;
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [optionPalette, setOptionPalette] = useState<{ x: number; y: number; visible: boolean; elementId: string } | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{
    visible: boolean;
    text: string;
    x: number;
    y: number;
  } | null>(null);

  // Visualization settings
  const [gridToleranceMeters, setGridToleranceMeters] = useState<number>(0.10);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [tempGridTolerance, setTempGridTolerance] = useState<number>(0.10);
  const [visualizationMode, setVisualizationMode] = useState<string>('espesores');
  const [tempVisualizationMode, setTempVisualizationMode] = useState<string>('espesores');

  const getFormattedTolerance = (valueInMeters: number): string => {
    if (!modelData || !modelData.project_info?.unit_system) {
      return `${valueInMeters.toFixed(3)} m (${(valueInMeters * 100).toFixed(1)} cm)`;
    }
    const unit = modelData.project_info.unit_system.toLowerCase();
    if (unit === 'cm') {
      return `${(valueInMeters * 100).toFixed(1)} cm (${valueInMeters.toFixed(3)} m)`;
    }
    if (unit === 'mm') {
      return `${(valueInMeters * 1000).toFixed(0)} mm (${valueInMeters.toFixed(3)} m)`;
    }
    if (unit === 'ft' || unit === 'foot' || unit === 'feet') {
      return `${(valueInMeters / 0.3048).toFixed(3)} ft (${valueInMeters.toFixed(3)} m)`;
    }
    if (unit === 'in' || unit === 'inch' || unit === 'inches') {
      return `${(valueInMeters / 0.0254).toFixed(2)} in (${valueInMeters.toFixed(3)} m)`;
    }
    return `${valueInMeters.toFixed(3)} m (${(valueInMeters * 100).toFixed(1)} cm)`;
  };

  const hiddenElementIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    hiddenElementIdsRef.current = hiddenElementIds;
  }, [hiddenElementIds]);

  // Ref to avoid stale closures in the single-instance animation loop
  const selectedLevelIdRef = useRef<string>('3d');
  useEffect(() => {
    selectedLevelIdRef.current = selectedLevelId;
  }, [selectedLevelId]);

  const selectedGridNameRef = useRef<string>('none');
  useEffect(() => {
    selectedGridNameRef.current = selectedGridName;
  }, [selectedGridName]);

  // Keep track of the last selected level/grid to only transition camera on actual changes
  const prevSelectedLevelIdRef = useRef<string>('3d');
  const prevSelectedGridNameRef = useRef<string>('none');

  // Sort levels by elevation
  const sortedLevels = modelData 
    ? [...modelData.levels].sort((a, b) => a.elevation - b.elevation) 
    : [];

  // Sort grids alphanumerically by name
  const sortedGrids = modelData && modelData.grids
    ? [...modelData.grids].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    : [];

  // Mutually exclusive selection handlers
  const handleLevelChange = (levelId: string) => {
    setSelectedLevelId(levelId);
    if (levelId !== '3d') {
      setSelectedGridName('none');
    }
  };
  const prevModelDataRef = useRef<JsonModelData | null>(null);
  const prevModelDataRefForCamera = useRef<JsonModelData | null>(null);

  const handleGridChange = (gridName: string) => {
    setSelectedGridName(gridName);
    if (gridName !== 'none') {
      setSelectedLevelId('3d');
    }
  };

  // Reset fit-camera ref, selected level/grid, and selected element when modelData changes
  useEffect(() => {
    const prevModel = prevModelDataRef.current;
    prevModelDataRef.current = modelData;

    hasFitCameraRef.current = false;
    setSelectedElements([]);
    setOptionPalette(null);
    setHiddenElementIds(new Set());

    if (modelData) {
      // 1. Level persistence by name
      if (selectedLevelId !== '3d' && prevModel) {
        const oldLevel = prevModel.levels.find(l => l.id === selectedLevelId);
        if (oldLevel) {
          const matchingNewLevel = modelData.levels.find(l => l.name === oldLevel.name);
          if (matchingNewLevel) {
            setSelectedLevelId(matchingNewLevel.id);
          } else {
            setSelectedLevelId('3d');
          }
        } else {
          setSelectedLevelId('3d');
        }
      } else {
        setSelectedLevelId('3d');
      }

      // 2. Grid/Axis persistence by name
      if (selectedGridName !== 'none') {
        const hasMatchingGrid = modelData.grids && modelData.grids.some(g => g.name === selectedGridName);
        if (!hasMatchingGrid) {
          setSelectedGridName('none');
        }
      }
    } else {
      setSelectedLevelId('3d');
      setSelectedGridName('none');
    }
  }, [modelData]);

  // Sync ground grid visibility directly using ref
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGroundGrid;
    }
  }, [showGroundGrid]);

  // Sync shadow casting directly using ref
  useEffect(() => {
    if (dirLightRef.current) {
      dirLightRef.current.castShadow = enableShadows;
    }
  }, [enableShadows]);

  // Handle 2D Plan View & 2D Grid Elevation View camera transition and rotation locking
  useEffect(() => {
    const controls = controlsRef.current;
    const persCamera = cameraRef.current;
    const orthoCamera = orthoCameraRef.current;
    if (!controls || !persCamera || !orthoCamera) return;

    const prevLevelId = prevSelectedLevelIdRef.current;
    const prevGridName = prevSelectedGridNameRef.current;
    const prevModelForCam = prevModelDataRefForCamera.current;
    prevModelDataRefForCamera.current = modelData;
    const hasModelChanged = modelData !== prevModelForCam;

    const hasLevelChanged = selectedLevelId !== prevLevelId || hasModelChanged;
    const hasGridChanged = selectedGridName !== prevGridName || hasModelChanged;

    prevSelectedLevelIdRef.current = selectedLevelId;
    prevSelectedGridNameRef.current = selectedGridName;

    if (selectedLevelId === '3d' && selectedGridName === 'none') {
      // Switch back to perspective camera
      activeCameraRef.current = persCamera;
      controls.object = persCamera;

      // Re-enable rotation
      controls.enableRotate = true;
      controls.mouseButtons = {
        LEFT: undefined as any,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
      };
      
      persCamera.updateProjectionMatrix();
      controls.update();
    } else if (selectedLevelId !== '3d' && modelData) {
      // Switch to Orthographic Camera for flat 2D layout without perspective depth
      activeCameraRef.current = orthoCamera;
      controls.object = orthoCamera;

      // Disable rotation for 2D plan view
      controls.enableRotate = false;
      controls.mouseButtons = {
        LEFT: undefined as any,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
      };

      if (hasLevelChanged) {
        let currentLevel = modelData.levels.find(l => l.id === selectedLevelId);
        if (!currentLevel && prevModelForCam) {
          const oldLevel = prevModelForCam.levels.find(l => l.id === selectedLevelId);
          if (oldLevel) {
            currentLevel = modelData.levels.find(l => l.name === oldLevel.name);
          }
        }
        const elevation = currentLevel ? currentLevel.elevation : 0;

        if (prevGridName !== 'none') {
          // Transitioning from elevation to a floor plan. Frame/fit the plan synchronously.
          const { center, maxDim } = getModelDataBBox();

          controls.target.set(center.x, elevation, center.z);
          orthoCamera.zoom = 1;
          orthoCamera.position.set(center.x, elevation + 100, center.z + 0.001);

          if (mountRef.current) {
            const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
            const dynamicFrustumSize = maxDim * 1.5;
            orthoCamera.left = (-dynamicFrustumSize * aspect) / 2;
            orthoCamera.right = (dynamicFrustumSize * aspect) / 2;
            orthoCamera.top = dynamicFrustumSize / 2;
            orthoCamera.bottom = -dynamicFrustumSize / 2;
          }
          orthoCamera.lookAt(controls.target);
          orthoCamera.updateProjectionMatrix();
        } else {
          // Keep current X and Z of the target to prevent jumping horizontally when changing between plans
          const target = controls.target.clone();
          target.y = elevation;

          // Update controls target immediately so camera looks at the correct height
          controls.target.copy(target);

          // Reset zoom only if we transitioned from 3D view
          if (prevLevelId === '3d') {
            orthoCamera.zoom = 1;
            orthoCamera.position.set(target.x, elevation + 100, target.z + 0.001);
            
            // Re-apply full plan framing bounds if transitioning from 3D
            let maxDim = 40;
            let modelGroup: THREE.Object3D | undefined;
            sceneRef.current?.traverse((obj) => {
              if (obj.name === 'bim_model_element') {
                modelGroup = obj;
              }
            });
            if (modelGroup && modelGroup.children.length > 0) {
              const bbox = new THREE.Box3().setFromObject(modelGroup);
              const size = bbox.getSize(new THREE.Vector3());
              maxDim = Math.max(size.x, size.y, size.z);
            }
            if (mountRef.current) {
              const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
              const dynamicFrustumSize = maxDim * 1.5;
              orthoCamera.left = (-dynamicFrustumSize * aspect) / 2;
              orthoCamera.right = (dynamicFrustumSize * aspect) / 2;
              orthoCamera.top = dynamicFrustumSize / 2;
              orthoCamera.bottom = -dynamicFrustumSize / 2;
            }
          } else {
            // Keep current horizontal position and zoom, just update elevation height
            orthoCamera.position.y = elevation + 100;
          }
          orthoCamera.lookAt(target);
          orthoCamera.updateProjectionMatrix();
        }
      }

      targetCameraPosition.current = null; // direct assignment, no perspective lerping across cameras
      controls.update();
    } else if (selectedGridName !== 'none' && modelData && modelData.grids) {
      const grid = modelData.grids.find(g => g.name === selectedGridName);
      if (grid) {
        // Switch to Orthographic Camera for flat 2D layout without perspective depth
        activeCameraRef.current = orthoCamera;
        controls.object = orthoCamera;

        // Disable rotation for 2D elevation view
        controls.enableRotate = false;
        controls.mouseButtons = {
          LEFT: undefined as any,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE
        };

        if (hasGridChanged) {
          const tx = activeStep === 'process' ? processTranslation.dx : 0;
          const ty = activeStep === 'process' ? processTranslation.dy : 0;
          const tz = activeStep === 'process' ? processTranslation.dz : 0;
          const rotAlpha = activeStep === 'process' ? (processTranslation.alpha * Math.PI) / 180 : 0;

          const convertCoords = (x: number, y: number, z: number): THREE.Vector3 => {
            let rx = x;
            let ry = y;
            if (rotAlpha !== 0) {
              rx = x * Math.cos(rotAlpha) - y * Math.sin(rotAlpha);
              ry = x * Math.sin(rotAlpha) + y * Math.cos(rotAlpha);
            }
            return new THREE.Vector3(rx + tx, z + tz, -ry - ty);
          };

          const elevations = modelData.levels.map(l => l.elevation);
          const minElevation = Math.min(...elevations, 0);
          const maxElevation = Math.max(...elevations, 10);
          const height = maxElevation - minElevation;
          const midElevation = (minElevation + maxElevation) / 2;

          const p1 = convertCoords(grid.p1[0], grid.p1[1], midElevation);
          const p2 = convertCoords(grid.p2[0], grid.p2[1], midElevation);

          const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          const length = p1.distanceTo(p2);

          // Direction of grid
          const dir = new THREE.Vector3().subVectors(p2, p1);
          dir.y = 0;
          dir.normalize();

          // Asegurar orientación consistente (evitar vista en espejo si p1 y p2 están invertidos entre modelos o en el JSON original)
          // Si es mayormente vertical (Z domina), asegurar que dir apunte hacia el Norte (-Z)
          // Si es mayormente horizontal (X domina), asegurar que dir apunte hacia el Este (+X)
          if (Math.abs(dir.z) > Math.abs(dir.x)) {
            if (dir.z > 0) {
              dir.multiplyScalar(-1);
            }
          } else {
            if (dir.x < 0) {
              dir.multiplyScalar(-1);
            }
          }

          // Normal of grid (perpendicular in XZ plane)
          const normal = new THREE.Vector3(-dir.z, 0, dir.x);

          // Position camera perpendicular to grid at mid-elevation
          const distance = Math.max(length, height) * 2;
          const cameraPos = new THREE.Vector3().copy(mid).addScaledVector(normal, distance);

          controls.target.copy(mid);

          // Configure Orthographic Camera boundaries dynamically ONLY if transitioning from non-elevation
          if (prevGridName === 'none') {
            orthoCamera.zoom = 1;
            if (mountRef.current) {
              const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
              const dynamicFrustumSize = Math.max(length, height) * 1.25;
              orthoCamera.left = (-dynamicFrustumSize * aspect) / 2;
              orthoCamera.right = (dynamicFrustumSize * aspect) / 2;
              orthoCamera.top = dynamicFrustumSize / 2;
              orthoCamera.bottom = -dynamicFrustumSize / 2;
            }
          }
          orthoCamera.position.copy(cameraPos);
          orthoCamera.lookAt(mid);
          orthoCamera.updateProjectionMatrix();
        }

        targetCameraPosition.current = null;
        controls.update();
      }
    }
  }, [selectedLevelId, selectedGridName, modelData, activeStep, processTranslation?.dx, processTranslation?.dy, processTranslation?.dz, processTranslation?.alpha]);

  useEffect(() => {
    if (!mountRef.current) return;

    let animationId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let controls: OrbitControls | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let onPointerDown: ((event: PointerEvent) => void) | null = null;
    let onPointerUp: ((event: PointerEvent) => void) | null = null;
    let onPointerDownCapture: ((event: PointerEvent) => void) | null = null;
    let onPointerMove: ((event: PointerEvent) => void) | null = null;
    let onPointerOut: (() => void) | null = null;

    try {
      // 1. Create Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xd9d9e5); // surface_dim (#d9d9e5) from Stitch theme
      sceneRef.current = scene;

      // 2. Create Cameras
      const width = mountRef.current.clientWidth || 800;
      const height = mountRef.current.clientHeight || 500;
      const aspect = width / height;

      // Perspective Camera
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
      camera.position.set(40, 30, 40);
      cameraRef.current = camera;

      // Orthographic Camera
      const frustumSize = 40;
      const orthoCamera = new THREE.OrthographicCamera(
        (-frustumSize * aspect) / 2,
        (frustumSize * aspect) / 2,
        frustumSize / 2,
        -frustumSize / 2,
        0.1,
        1000
      );
      orthoCamera.position.set(0, 50, 0.001);
      orthoCameraRef.current = orthoCamera;

      // Active Camera starts as Perspective
      const activeCamera = camera;
      activeCameraRef.current = activeCamera;

      // 3. Create Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Enable beautiful soft shadows
      
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
      controls = new OrbitControls(activeCamera, renderer.domElement);
      controls.enableDamping = false; // Disable damping/inertia as requested by the user
      controls.maxPolarAngle = Math.PI / 2 + 0.1; // don't go too far below ground
      controls.mouseButtons = {
        LEFT: undefined as any,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
      };
      controlsRef.current = controls;

      // Cancel camera transition on user interaction (resolves "elastic band" lock-up)
      controls.addEventListener('start', () => {
        targetCameraPosition.current = null;
      });

      // 5. Add Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Lower ambient light for better shadow depth
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
      dirLight.name = 'main_directional_light';
      dirLight.position.set(80, 120, 50); // Positioned high and to the side for shadows
      dirLight.castShadow = enableShadows;
      
      // High-resolution shadow mapping settings
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 500;
      
      // Configure ortho camera boundaries to fit structural model bounds
      const d = 80;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.bias = -0.0005; // Minimize shadow mapping acne
      scene.add(dirLight);
      dirLightRef.current = dirLight; // Populate ref for shadows toggle

      const dirLight2 = new THREE.DirectionalLight(0xb4c5ff, 0.3);
      dirLight2.position.set(-80, 30, -50);
      scene.add(dirLight2);

      // 6. Draw structural axes helper at base
      const axesHelper = new THREE.AxesHelper(5);
      scene.add(axesHelper);

      // 7. Grid ground helper
      const gridHelper = new THREE.GridHelper(100, 50, 0x004ac6, 0xc3c6d7);
      gridHelper.position.y = -0.01;
      gridHelper.name = 'ground_grid_helper';
      gridHelper.visible = showGroundGrid;
      scene.add(gridHelper);
      gridHelperRef.current = gridHelper; // Populate ref for gridHelper toggle

      // Set scene instance to trigger geometry effect
      setSceneInstance(scene);

      // Render loop
      const animate = () => {
        animationId = requestAnimationFrame(animate);

        const activeCamera = activeCameraRef.current;
        const controls = controlsRef.current;
        const renderer = rendererRef.current;

        if (activeCamera && controls && renderer) {
          // Camera position smooth interpolation for navigation cube face clicks
          if (targetCameraPosition.current) {
            activeCamera.position.lerp(targetCameraPosition.current, 0.15);
            // Increased threshold to 0.05 to avoid floating-point lock-ups
            if (activeCamera.position.distanceTo(targetCameraPosition.current) < 0.05) {
              activeCamera.position.copy(targetCameraPosition.current);
              targetCameraPosition.current = null;
            }
            controls.update();
          }

          // Calculate spherical pitch & yaw to rotate CSS viewcube in sync (only in 3D perspective mode)
          if (selectedLevelIdRef.current === '3d' && activeCamera instanceof THREE.PerspectiveCamera) {
            const offset = new THREE.Vector3().copy(activeCamera.position).sub(controls.target);
            const len = offset.length();
            if (len > 0) {
              const theta = Math.atan2(offset.x, offset.z); // yaw
              const phi = Math.acos(Math.min(Math.max(offset.y / len, -1), 1)); // pitch
              
              // Correct pitchDeg direction to match CSS 3D coordinate system (fixes top/bottom viewport rotation)
              const pitchDeg = (phi * 180) / Math.PI - 90;
              const yawDeg = -(theta * 180) / Math.PI;
              setCubeTransform(`rotateX(${pitchDeg}deg) rotateY(${yawDeg}deg)`);
            }
          }

          controls.update();
          renderer.render(scene, activeCamera);
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
            const currentAspect = w / h;
            if (cameraRef.current) {
              cameraRef.current.aspect = currentAspect;
              cameraRef.current.updateProjectionMatrix();
            }
            if (orthoCameraRef.current) {
              const ortho = orthoCameraRef.current;
              const currentHeight = ortho.top - ortho.bottom;
              ortho.left = (-currentHeight * currentAspect) / 2;
              ortho.right = (currentHeight * currentAspect) / 2;
              ortho.updateProjectionMatrix();
            }
            if (rendererRef.current) {
              rendererRef.current.setSize(w, h);
            }
          }
        }
      });
      resizeObserver.observe(mountRef.current);

      let pointerDownX = 0;
      let pointerDownY = 0;
      let isSelecting = false;

      // Capturing pointerdown handler to configure OrbitControls mouse buttons dynamically
      onPointerDownCapture = (event: PointerEvent) => {
        if (!controls) return;
        if (event.shiftKey) {
          controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.ROTATE
          };
        } else {
          controls.mouseButtons = {
            LEFT: undefined as any,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE
          };
        }
      };

      onPointerDown = (event: PointerEvent) => {
        pointerDownX = event.clientX;
        pointerDownY = event.clientY;
        
        // Only start selection if it's Left click (button 0) AND shift is NOT pressed
        if (event.button === 0 && !event.shiftKey) {
          isSelecting = true;
          setSelectionBox({
            startX: event.clientX,
            startY: event.clientY,
            currentX: event.clientX,
            currentY: event.clientY
          });
          setOptionPalette(null);
        } else {
          isSelecting = false;
        }
      };

      onPointerMove = (event: PointerEvent) => {
        if (isSelecting) {
          setSelectionBox(prev => prev ? {
            ...prev,
            currentX: event.clientX,
            currentY: event.clientY
          } : null);
          setHoverTooltip(null);
          return;
        }

        const activeCamera = activeCameraRef.current;
        if (!renderer || !scene || !activeCamera) return;

        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.params.Line = { threshold: 0.3 };
        raycaster.setFromCamera(new THREE.Vector2(x, y), activeCamera);

        const intersects = raycaster.intersectObjects(scene.children, true);
        
        let hoveredItem: { name: string; type: string } | null = null;
        for (const intersect of intersects) {
          let current: THREE.Object3D | null = intersect.object;
          while (current) {
            if (
              current.userData &&
              (current.userData.type === 'grid_line' || current.userData.type === 'level_line')
            ) {
              hoveredItem = {
                name: current.userData.name,
                type: current.userData.type
              };
              break;
            }
            current = current.parent;
          }
          if (hoveredItem) break;
        }

        if (hoveredItem) {
          const tooltipX = event.clientX - rect.left;
          const tooltipY = event.clientY - rect.top;
          const text = hoveredItem.type === 'grid_line' ? `Grilla: ${hoveredItem.name}` : `Nivel: ${hoveredItem.name}`;
          
          setHoverTooltip(prev => {
            if (prev && prev.text === text && Math.abs(prev.x - tooltipX) < 2 && Math.abs(prev.y - tooltipY) < 2) {
              return prev;
            }
            return {
              visible: true,
              text,
              x: tooltipX,
              y: tooltipY
            };
          });
          renderer.domElement.style.cursor = 'pointer';
        } else {
          setHoverTooltip(null);
          if (renderer.domElement.style.cursor === 'pointer') {
            renderer.domElement.style.cursor = 'default';
          }
        }
      };

      onPointerUp = (event: PointerEvent) => {
        if (!isSelecting) return;
        isSelecting = false;
        setSelectionBox(null);

        const diffX = Math.abs(event.clientX - pointerDownX);
        const diffY = Math.abs(event.clientY - pointerDownY);

        const activeCamera = activeCameraRef.current;
        if (!renderer || !scene || !activeCamera) return;
        const rect = renderer.domElement.getBoundingClientRect();

        if (diffX < 5 && diffY < 5) {
          // Single Click selection
          const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(x, y), activeCamera);

          const intersects = raycaster.intersectObjects(scene.children, true);
          
          let hitObject: THREE.Object3D | null = null;
          for (const intersect of intersects) {
            let current: THREE.Object3D | null = intersect.object;
            while (current) {
              if (current.userData && current.userData.id && !hiddenElementIdsRef.current.has(current.userData.id)) {
                hitObject = current;
                break;
              }
              current = current.parent;
            }
            if (hitObject) break;
          }

          if (hitObject) {
            const { id, type, data } = hitObject.userData;
            setSelectedElements([{ id, type, data }]);
            setOptionPalette({
              visible: true,
              x: event.clientX,
              y: event.clientY,
              elementId: id
            });
          } else {
            setSelectedElements([]);
            setOptionPalette(null);
          }
        } else {
          // Box Selection
          const xMin = Math.min(pointerDownX, event.clientX);
          const xMax = Math.max(pointerDownX, event.clientX);
          const yMin = Math.min(pointerDownY, event.clientY);
          const yMax = Math.max(pointerDownY, event.clientY);

          const isLeftToRight = pointerDownX <= event.clientX;

          const found: { id: string; type: 'wall' | 'beam' | 'slab'; data: any }[] = [];

          scene.traverse((obj) => {
            if (
              obj.userData &&
              obj.userData.id &&
              (obj.userData.type === 'wall' || obj.userData.type === 'beam' || obj.userData.type === 'slab') &&
              !hiddenElementIdsRef.current.has(obj.userData.id)
            ) {
              const box = new THREE.Box3().setFromObject(obj);
              const min = box.min;
              const max = box.max;
              const corners = [
                new THREE.Vector3(min.x, min.y, min.z),
                new THREE.Vector3(min.x, min.y, max.z),
                new THREE.Vector3(min.x, max.y, min.z),
                new THREE.Vector3(min.x, max.y, max.z),
                new THREE.Vector3(max.x, min.y, min.z),
                new THREE.Vector3(max.x, min.y, max.z),
                new THREE.Vector3(max.x, max.y, min.z),
                new THREE.Vector3(max.x, max.y, max.z)
              ];

              const projectedCorners = corners.map((corner) => {
                const tempV = corner.clone().project(activeCamera);
                const px = ((tempV.x + 1) / 2) * rect.width + rect.left;
                const py = ((1 - tempV.y) / 2) * rect.height + rect.top;
                const pz = tempV.z;
                return { x: px, y: py, z: pz };
              });

              // Check if in front of camera
              const inFront = projectedCorners.some(c => c.z >= -1 && c.z <= 1);
              if (!inFront) return;

              const xs = projectedCorners.map(c => c.x);
              const ys = projectedCorners.map(c => c.y);
              const objXMin = Math.min(...xs);
              const objXMax = Math.max(...xs);
              const objYMin = Math.min(...ys);
              const objYMax = Math.max(...ys);

              if (isLeftToRight) {
                // Window Selection: all corners must be inside selection box
                const allInside = projectedCorners.every(
                  c => c.x >= xMin && c.x <= xMax && c.y >= yMin && c.y <= yMax
                );
                if (allInside) {
                  found.push({
                    id: obj.userData.id,
                    type: obj.userData.type,
                    data: obj.userData.data
                  });
                }
              } else {
                // Crossing Selection: overlap
                const overlap = !(objXMax < xMin || objXMin > xMax || objYMax < yMin || objYMin > yMax);
                if (overlap) {
                  found.push({
                    id: obj.userData.id,
                    type: obj.userData.type,
                    data: obj.userData.data
                  });
                }
              }
            }
          });

          setSelectedElements(found);
          setOptionPalette(null);
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDownCapture, true);
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      
      onPointerOut = () => {
        setHoverTooltip(null);
      };
      renderer.domElement.addEventListener('pointerout', onPointerOut);

    } catch (e: any) {
      console.error('Three.js Init Error:', e);
      setErrorLog('Init Error: ' + (e.message || String(e)));
    }

    return () => {
      cancelAnimationFrame(animationId);
      if (resizeObserver) resizeObserver.disconnect();
      if (controls) (controls as any).dispose();
      
      setSceneInstance(null);
      gridHelperRef.current = null; // Clear refs on cleanup
      dirLightRef.current = null;
      
      if (renderer && renderer.domElement) {
        // Remove event listeners
        if (onPointerDownCapture) renderer.domElement.removeEventListener('pointerdown', onPointerDownCapture, true);
        if (onPointerDown) renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        if (onPointerMove) renderer.domElement.removeEventListener('pointermove', onPointerMove);
        if (onPointerUp) renderer.domElement.removeEventListener('pointerup', onPointerUp);
        if (onPointerOut) renderer.domElement.removeEventListener('pointerout', onPointerOut);
      }

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

    const selectedIdsSet = new Set(selectedElements.map((el) => el.id));

    try {
      // Create a group container for current model elements (double-buffered)
      const modelGroup = new THREE.Group();
      modelGroup.name = 'bim_model_element';



      if (modelData) {
        // Setup translation matrices for the "process" step if enabled
        const tx = activeStep === 'process' ? processTranslation.dx : 0;
        const ty = activeStep === 'process' ? processTranslation.dy : 0;
        const tz = activeStep === 'process' ? processTranslation.dz : 0;
        const rotAlpha = activeStep === 'process' ? (processTranslation.alpha * Math.PI) / 180 : 0;

        // Convert coordinates:
        // JSON Z is up elevation -> maps to Three.js Y
        // JSON Y is plan north-south -> maps to Three.js -Z (inverted to correct vertical mirroring in plan view)
        // JSON X is plan east-west -> maps to Three.js X
        const convertCoords = (x: number, y: number, z: number): THREE.Vector3 => {
          // Apply rotation around Z-axis (which is vertical in JSON coordinate system, mapping to Three.js Y-axis)
          let rx = x;
          let ry = y;
          if (rotAlpha !== 0) {
            rx = x * Math.cos(rotAlpha) - y * Math.sin(rotAlpha);
            ry = x * Math.sin(rotAlpha) + y * Math.cos(rotAlpha);
          }
          return new THREE.Vector3(rx + tx, z + tz, -ry - ty);
        };

        // Get all unique material names from sections to check if they are all equal
        const uniqueMaterials = Array.from(new Set(
          modelData.sections.map(s => s.material || 'unknown')
        )).filter(m => m !== 'unknown');

        const materialColorsList = [
          '#4f46e5', // Indigo
          '#10b981', // Emerald
          '#f59e0b', // Amber
          '#ef4444', // Rose
          '#06b6d4', // Cyan
          '#8b5cf6', // Violet
          '#ec4899', // Pink
          '#14b8a6', // Teal
        ];

        const getMaterialColor = (matName: string, elementType: 'wall' | 'beam' | 'slab'): string => {
          if (uniqueMaterials.length <= 1) {
            if (elementType === 'wall') return '#94a3b8';
            if (elementType === 'beam') return '#64748b';
            return '#cbd5e1';
          }
          const index = uniqueMaterials.indexOf(matName);
          if (index <= 0) {
            if (elementType === 'wall') return '#94a3b8';
            if (elementType === 'beam') return '#64748b';
            return '#cbd5e1';
          }
          return materialColorsList[(index - 1) % materialColorsList.length];
        };

        const getEspesoresColor = (thicknessMeters: number): string => {
          const mm = Math.round(thicknessMeters * 1000);
          if (mm === 150) return '#DFDFDF';
          if (mm === 200) return '#0080C0';
          if (mm === 250) return '#00FF00';
          if (mm === 300) return '#FF8000';
          if (mm === 350) return '#8080FF';
          if (mm === 400) return '#FF80FF';
          return '#800040';
        };

        const getElementColor = (
          elementType: 'wall' | 'beam' | 'slab',
          sectionCodeName: string
        ): string => {
          const sec = modelData.sections.find(s => s.code_name === sectionCodeName);
          
          if (visualizationMode === 'espesores') {
            let thickness = 0.2; // default
            if (sec) {
              if (elementType === 'wall') {
                thickness = sec.parameters.thickness ?? 0.2;
              } else if (elementType === 'slab') {
                thickness = sec.parameters.thickness ?? 0.15;
              } else if (elementType === 'beam') {
                thickness = sec.parameters.width ?? 0.2;
              }
            }
            return getEspesoresColor(thickness);
          }
          
          if (visualizationMode === 'tipo') {
            if (elementType === 'wall') return '#8F2C38';
            if (elementType === 'beam') return '#ECB613';
            return '#cbd5e1'; // default slab grey
          }
          
          // default visualizationMode === 'material'
          const matName = sec?.material || 'unknown';
          return getMaterialColor(matName, elementType);
        };

        // Find the selected grid
        const selectedGrid = selectedGridName !== 'none' && modelData.grids
          ? modelData.grids.find(g => g.name === selectedGridName)
          : null;

        // Calculate grid tolerance based on the project's unit system (defaulting to gridToleranceMeters if unit_system is 'm')
        let gridTolerance = gridToleranceMeters;
        if (modelData.project_info?.unit_system) {
          const unit = modelData.project_info.unit_system.toLowerCase();
          if (unit === 'cm') {
            gridTolerance = gridToleranceMeters * 100;
          } else if (unit === 'mm') {
            gridTolerance = gridToleranceMeters * 1000;
          } else if (unit === 'ft' || unit === 'foot' || unit === 'feet') {
            gridTolerance = gridToleranceMeters / 0.3048;
          } else if (unit === 'in' || unit === 'inch' || unit === 'inches') {
            gridTolerance = gridToleranceMeters / 0.0254;
          }
        }

        // Get active level elevation for grid drawing
        let activeLevelElevation = 0;
        if (selectedLevelId !== '3d' && modelData.levels) {
          const activeLvl = modelData.levels.find(l => l.id === selectedLevelId);
          if (activeLvl) {
            activeLevelElevation = activeLvl.elevation;
          }
        }

        // 1. Draw Grids
        if (showGrids && filters.elements.grillas && modelData.grids) {
          try {
            const gridMaterial = new THREE.LineDashedMaterial({
              color: 0x737686,
              linewidth: 1,
              dashSize: 0.8,
              gapSize: 0.4,
              transparent: true,
              opacity: 0.5
            });
            modelData.grids.forEach((grid) => {
              // Offset elevation slightly above floor plane to avoid z-fighting with slabs
              const elevationOffset = activeLevelElevation + 0.01;
              const p1 = convertCoords(grid.p1[0], grid.p1[1], elevationOffset);
              const p2 = convertCoords(grid.p2[0], grid.p2[1], elevationOffset);
              const points = [p1, p2];
              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.Line(geometry, gridMaterial);
              line.computeLineDistances();
              line.name = 'bim_model_element';
              line.userData = {
                type: 'grid_line',
                name: grid.name
              };
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
              if (hiddenElementIds.has(wall.revit_id)) return;

              // Filter by Level
              if (selectedLevelId !== '3d') {
                if (wall.level !== selectedLevelId) return;
              } else {
                if (!checkedLevels.has(wall.level)) return;
              }

              // Filter by Elevation Grid
              if (selectedGrid) {
                const outline = wall.location.outline;
                if (outline && outline.length >= 2) {
                  // Find the two furthest points in original coordinates to check alignment
                  let maxDist = -1;
                  let pStartOrig = outline[0];
                  let pEndOrig = outline[1] || outline[0];
                  
                  for (let i = 0; i < outline.length; i++) {
                    for (let j = i + 1; j < outline.length; j++) {
                      const dx = outline[i][0] - outline[j][0];
                      const dy = outline[i][1] - outline[j][1];
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if (dist > maxDist) {
                        maxDist = dist;
                        pStartOrig = outline[i];
                        pEndOrig = outline[j];
                      }
                    }
                  }
                  
                  const d1 = getDistanceToGridLine(pStartOrig[0], pStartOrig[1], selectedGrid);
                  const d2 = getDistanceToGridLine(pEndOrig[0], pEndOrig[1], selectedGrid);
                  if (d1 > gridTolerance || d2 > gridTolerance) return; // Unit-aware grid tolerance
                  
                  // Overlap check
                  const tStart = getGridProjectionT(pStartOrig[0], pStartOrig[1], selectedGrid);
                  const tEnd = getGridProjectionT(pEndOrig[0], pEndOrig[1], selectedGrid);
                  if (!intervalsOverlap(Math.min(tStart, tEnd), Math.max(tStart, tEnd), -0.05, 1.05)) return;
                } else {
                  return;
                }
              }

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
              if (outline && outline.length >= 2) {
                // Convert all outline points to Three.js coordinates
                const pts = outline.map((p) => convertCoords(p[0], p[1], p[2]));
                
                // Find the base elevation (minimum Y coordinate in Three.js)
                let baseElevation = pts[0].y;
                pts.forEach((p) => {
                  if (p.y < baseElevation) baseElevation = p.y;
                });
                
                // Find the two points that are furthest apart in the horizontal XZ plane
                // to define the wall centerline start and end points.
                let maxDist = -1;
                let pStart = pts[0];
                let pEnd = pts[1] || pts[0];
                
                for (let i = 0; i < pts.length; i++) {
                  for (let j = i + 1; j < pts.length; j++) {
                    const dx = pts[i].x - pts[j].x;
                    const dz = pts[i].z - pts[j].z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist > maxDist) {
                      maxDist = dist;
                      pStart = pts[i];
                      pEnd = pts[j];
                    }
                  }
                }
                
                // Ensure pStart and pEnd are at the base elevation
                pStart = new THREE.Vector3(pStart.x, baseElevation, pStart.z);
                pEnd = new THREE.Vector3(pEnd.x, baseElevation, pEnd.z);
                
                const length = pStart.distanceTo(pEnd);
                const height = wall.location.height || 3.0;
                
                // Get thickness from section parameters (default to 0.2m = 20cm)
                const wallSec = modelData.sections.find((s) => s.code_name === wall.section);
                const thickness = wallSec ? (wallSec.parameters.thickness || 0.2) : 0.2;
                
                // Create a 3D box geometry for the wall
                const geometry = new THREE.BoxGeometry(thickness, height, length);
                
                // Matte solid concrete grey for walls (or blue if selected)
                const isSelected = selectedIdsSet.has(wall.revit_id);
                 const material = new THREE.MeshStandardMaterial({
                   color: isSelected ? 0x2563eb : getElementColor('wall', wall.section), // Blue if selected, dynamic color otherwise
                   roughness: isSelected ? 0.6 : 0.8,
                   metalness: isSelected ? 0.2 : 0.1,
                   transparent: enableTransparency,
                   opacity: enableTransparency ? 0.65 : 1.0
                 });
                 
                 const mesh = new THREE.Mesh(geometry, material);
                 mesh.userData = {
                   id: wall.revit_id,
                   type: 'wall',
                   data: wall
                 };

                 const shouldAddEdges = (enableTransparency && (selectedLevelId !== '3d' || selectedGridName !== 'none')) || (isSelected && enableTransparency);
                 if (shouldAddEdges) {
                   const edgesGeometry = new THREE.EdgesGeometry(geometry);
                   const edgesMaterial = new THREE.LineBasicMaterial({
                     color: isSelected ? 0x1d4ed8 : 0x334155, // Solid blue if selected, Dark slate otherwise
                     linewidth: isSelected ? 2 : 1
                   });
                   const edgeSegments = new THREE.LineSegments(edgesGeometry, edgesMaterial);
                   mesh.add(edgeSegments);
                 }
                 
                 // Position at the center of the wall segment
                 const center = new THREE.Vector3().copy(pStart).add(pEnd).multiplyScalar(0.5);
                 center.y += height / 2; // raise by half height
                 mesh.position.copy(center);
                 
                 // Rotate to align with the wall direction (looking towards pEnd)
                 mesh.lookAt(pEnd.x, center.y, pEnd.z);
                 
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
              if (hiddenElementIds.has(beam.revit_id)) return;

              if (selectedLevelId !== '3d') {
                if (beam.level !== selectedLevelId) return;
              } else {
                if (!checkedLevels.has(beam.level)) return;
              }

              // Filter by Elevation Grid
              if (selectedGrid) {
                const start = beam.location.start;
                const end = beam.location.end;
                if (start && end) {
                  const d1 = getDistanceToGridLine(start[0], start[1], selectedGrid);
                  const d2 = getDistanceToGridLine(end[0], end[1], selectedGrid);
                  if (d1 > gridTolerance || d2 > gridTolerance) return; // Unit-aware grid tolerance
                  
                  // Overlap check
                  const tStart = getGridProjectionT(start[0], start[1], selectedGrid);
                  const tEnd = getGridProjectionT(end[0], end[1], selectedGrid);
                  if (!intervalsOverlap(Math.min(tStart, tEnd), Math.max(tStart, tEnd), -0.05, 1.05)) return;
                } else {
                  return;
                }
              }

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
                
                // Matte solid concrete grey for beams (or blue if selected)
                const isSelected = selectedIdsSet.has(beam.revit_id);
                 const beamMat = new THREE.MeshStandardMaterial({
                   color: isSelected ? 0x2563eb : getElementColor('beam', beam.section), // Blue if selected, dynamic color otherwise
                   roughness: isSelected ? 0.6 : 0.8,
                   metalness: isSelected ? 0.2 : 0.1,
                   transparent: enableTransparency,
                   opacity: enableTransparency ? 0.65 : 1.0
                 });

                 const beamMesh = new THREE.Mesh(beamGeo, beamMat);
                 beamMesh.userData = {
                   id: beam.revit_id,
                   type: 'beam',
                   data: beam
                 };

                 const shouldAddBeamEdges = (enableTransparency && (selectedLevelId !== '3d' || selectedGridName !== 'none')) || (isSelected && enableTransparency);
                 if (shouldAddBeamEdges) {
                   const edgesGeometry = new THREE.EdgesGeometry(beamGeo);
                   const edgesMaterial = new THREE.LineBasicMaterial({
                     color: isSelected ? 0x1d4ed8 : 0x1e293b, // Solid blue if selected, Darker grey otherwise
                     linewidth: isSelected ? 2 : 1
                   });
                   const edgeSegments = new THREE.LineSegments(edgesGeometry, edgesMaterial);
                   beamMesh.add(edgeSegments);
                 }
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
              if (hiddenElementIds.has(slab.revit_id)) return;

              if (selectedLevelId !== '3d') {
                if (slab.level !== selectedLevelId) return;
              } else {
                if (!checkedLevels.has(slab.level)) return;
              }

              // Filter by Elevation Grid
              if (selectedGrid) {
                const outline = slab.location.outline;
                if (outline && outline.length >= 3) {
                  let intersects = false;
                  // Check if either grid endpoint is inside the slab
                  if (isPointInPolygon(selectedGrid.p1, outline) || isPointInPolygon(selectedGrid.p2, outline)) {
                    intersects = true;
                  }
                  // Check if grid segment intersects any slab outer edge
                  if (!intersects) {
                    for (let i = 0; i < outline.length; i++) {
                      const nextIdx = (i + 1) % outline.length;
                      const edgeP1: [number, number] = [outline[i][0], outline[i][1]];
                      const edgeP2: [number, number] = [outline[nextIdx][0], outline[nextIdx][1]];
                      if (lineSegmentsIntersect(selectedGrid.p1, selectedGrid.p2, edgeP1, edgeP2)) {
                        intersects = true;
                        break;
                      }
                    }
                  }
                  if (!intersects) return;
                } else {
                  return;
                }
              }

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
                // Use original Y coordinate (rotateX(-PI/2) will project Y to -Z correctly)
                shape.moveTo(p0[0], p0[1]);

                for (let i = 1; i < outline.length; i++) {
                  shape.lineTo(outline[i][0], outline[i][1]);
                }
                shape.closePath();

                // Add openings with original Y coordinates
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

                // Matte solid concrete grey for slabs (or blue if selected)
                const isSelected = selectedIdsSet.has(slab.revit_id);
                 const material = new THREE.MeshStandardMaterial({
                   color: isSelected ? 0x2563eb : getElementColor('slab', slab.section), // Blue if selected, dynamic color otherwise
                   roughness: isSelected ? 0.6 : 0.9,
                   metalness: isSelected ? 0.2 : 0.1,
                   side: THREE.DoubleSide,
                   transparent: enableTransparency,
                   opacity: enableTransparency ? 0.65 : 1.0
                 });

                 const mesh = new THREE.Mesh(geometry, material);
                 mesh.userData = {
                   id: slab.revit_id,
                   type: 'slab',
                   data: slab
                 };

                 const shouldAddSlabEdges = (enableTransparency && (selectedLevelId !== '3d' || selectedGridName !== 'none')) || (isSelected && enableTransparency);
                 if (shouldAddSlabEdges) {
                   const edgesGeometry = new THREE.EdgesGeometry(geometry);
                   const edgesMaterial = new THREE.LineBasicMaterial({
                     color: isSelected ? 0x1d4ed8 : 0x475569, // Solid blue if selected, Medium grey otherwise
                     linewidth: isSelected ? 2 : 1
                   });
                   const edgeSegments = new THREE.LineSegments(edgesGeometry, edgesMaterial);
                   mesh.add(edgeSegments);
                 }
                
                // Elevate slab to its level Z coordinate (mapped to Three.js Y)
                const elevation = p0[2] + tz;
                mesh.position.set(tx, elevation, -ty);
                
                // Apply rotation to slab mesh if process rotation is set
                if (rotAlpha !== 0) {
                  mesh.rotation.y = rotAlpha;
                }
                mesh.castShadow = true; // Enable shadow casting for slabs
                mesh.receiveShadow = true;
                modelGroup.add(mesh);
                slabsCount++;
              }
            } catch (e) {
              console.error('Error drawing slab:', slab, e);
            }
          });
        }

        // 5. Draw Level Lines in Elevation View
        if (selectedGrid && modelData.levels) {
          try {
            // Horizontal dashed lines for each level along the grid line segment (with 50% transparency)
            const lineMaterial = new THREE.LineDashedMaterial({
              color: 0x475569, // Slate grey
              dashSize: 0.8,
              gapSize: 0.4,
              linewidth: 1,
              transparent: true,
              opacity: 0.5
            });

            const p1_mid = convertCoords(selectedGrid.p1[0], selectedGrid.p1[1], 0);
            const p2_mid = convertCoords(selectedGrid.p2[0], selectedGrid.p2[1], 0);
            const dir = new THREE.Vector3().subVectors(p2_mid, p1_mid);
            dir.y = 0;
            dir.normalize();

            // Asegurar orientación consistente (evitar vista en espejo si p1 y p2 están invertidos entre modelos o en el JSON original)
            // Si es mayormente vertical (Z domina), asegurar que dir apunte hacia el Norte (-Z)
            // Si es mayormente horizontal (X domina), asegurar que dir apunte hacia el Este (+X)
            if (Math.abs(dir.z) > Math.abs(dir.x)) {
              if (dir.z > 0) {
                dir.multiplyScalar(-1);
              }
            } else {
              if (dir.x < 0) {
                dir.multiplyScalar(-1);
              }
            }

            const normal = new THREE.Vector3(-dir.z, 0, dir.x);

            modelData.levels.forEach((lvl) => {
              const p1 = convertCoords(selectedGrid.p1[0], selectedGrid.p1[1], lvl.elevation);
              const p2 = convertCoords(selectedGrid.p2[0], selectedGrid.p2[1], lvl.elevation);
              
              const points = [p1, p2];
              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.Line(geometry, lineMaterial);
              line.computeLineDistances();
              
              line.name = 'bim_model_element';
              line.userData = {
                type: 'level_line',
                name: lvl.name
              };
              modelGroup.add(line);

              // Circular bubble at start of the line (p1)
              const circleGeo1 = new THREE.CircleGeometry(0.15, 16);
              const circleMat1 = new THREE.MeshBasicMaterial({
                color: 0x475569,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.5
              });
              const circleMesh1 = new THREE.Mesh(circleGeo1, circleMat1);
              circleMesh1.position.copy(p1);
              circleMesh1.lookAt(new THREE.Vector3().addVectors(p1, normal));
              circleMesh1.name = 'bim_model_element';
              circleMesh1.userData = {
                type: 'level_line',
                name: lvl.name
              };
              modelGroup.add(circleMesh1);

              // Circular bubble at end of the line (p2)
              const circleGeo2 = new THREE.CircleGeometry(0.15, 16);
              const circleMat2 = new THREE.MeshBasicMaterial({
                color: 0x475569,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.5
              });
              const circleMesh2 = new THREE.Mesh(circleGeo2, circleMat2);
              circleMesh2.position.copy(p2);
              circleMesh2.lookAt(new THREE.Vector3().addVectors(p2, normal));
              circleMesh2.name = 'bim_model_element';
              circleMesh2.userData = {
                type: 'level_line',
                name: lvl.name
              };
              modelGroup.add(circleMesh2);
            });
          } catch (e) {
            console.error('Error drawing level lines in elevation:', e);
          }
        }
      }

      // Auto-fit camera around model boundaries on first load (only in 3D view)
      if (selectedLevelId === '3d' && selectedGridName === 'none' && modelGroup.children.length > 0 && !hasFitCameraRef.current) {
        const bbox = new THREE.Box3().setFromObject(modelGroup);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const camera = cameraRef.current;
        const orthoCamera = orthoCameraRef.current;
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

          // Configure Orthographic Camera boundaries dynamically based on bounding box size
          if (orthoCamera && mountRef.current) {
            const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
            const dynamicFrustumSize = maxDim * 1.5; // 50% buffer padding
            orthoCamera.left = (-dynamicFrustumSize * aspect) / 2;
            orthoCamera.right = (dynamicFrustumSize * aspect) / 2;
            orthoCamera.top = dynamicFrustumSize / 2;
            orthoCamera.bottom = -dynamicFrustumSize / 2;
            orthoCamera.updateProjectionMatrix();
          }

          controls.update();
          hasFitCameraRef.current = true;
        }
      }

      // Clean up previous elements synchronously just before adding the new one (double buffering)
      const toRemove: THREE.Object3D[] = [];
      scene.traverse((obj: THREE.Object3D) => {
        if (obj.name === 'bim_model_element') {
          toRemove.push(obj);
        }
      });
      toRemove.forEach((obj) => {
        scene.remove(obj);
        obj.traverse((child: any) => {
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m: any) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      });

      // Add the new model group to the scene
      scene.add(modelGroup);

      // Count polygons in modelGroup
      let polys = 0;
      modelGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const geom = obj.geometry;
          if (geom) {
            if (geom.index) {
              polys += geom.index.count / 3;
            } else if (geom.attributes.position) {
              polys += geom.attributes.position.count / 3;
            }
          }
        }
      });
      setPolygonCount(Math.round(polys));

      setRenderedCounts({ walls: wallsCount, beams: beamsCount, slabs: slabsCount });
    } catch (err: any) {
      console.error('Geometry update error:', err);
      setErrorLog(err.message || String(err));
    }
  }, [sceneInstance, modelData, filters, showGrids, activeStep, processTranslation?.dx, processTranslation?.dy, processTranslation?.dz, processTranslation?.alpha, selectedLevelId, selectedGridName, enableTransparency, selectedElements, hiddenElementIds, gridToleranceMeters, visualizationMode]);

  function resetZoomAndFrame() {
    console.log('[resetZoomAndFrame] Triggered. selectedLevelId:', selectedLevelId, 'selectedGridName:', selectedGridName);
    const scene = sceneRef.current;
    if (!scene) {
      console.warn('[resetZoomAndFrame] Early return: scene is null');
      return;
    }

    const camera = cameraRef.current;
    const orthoCamera = orthoCameraRef.current;
    const controls = controlsRef.current;

    if (!controls) {
      console.warn('[resetZoomAndFrame] Early return: controls is null');
      return;
    }

    const { center, maxDim } = getModelDataBBox();
    console.log('[resetZoomAndFrame] Calculated bbox center:', center, 'maxDim:', maxDim);

    if (selectedLevelId === '3d' && selectedGridName === 'none') {
      console.log('[resetZoomAndFrame] Entering 3D Perspective branch');
      if (camera && maxDim > 0) {
        controls.target.copy(center);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;
        camera.position.set(center.x + cameraZ * 0.8, center.y + cameraZ * 0.6, center.z + cameraZ * 0.8);
        camera.lookAt(center);
        controls.update();
        console.log('[resetZoomAndFrame] 3D reset done. Camera pos:', camera.position, 'controls target:', controls.target);
      }
    } else if (selectedGridName !== 'none' && modelData && modelData.grids) {
      console.log('[resetZoomAndFrame] Entering Grid Elevation branch for grid:', selectedGridName);
      const grid = modelData.grids.find(g => g.name === selectedGridName);
      if (grid && orthoCamera && mountRef.current) {
        const tx = activeStep === 'process' ? processTranslation.dx : 0;
        const ty = activeStep === 'process' ? processTranslation.dy : 0;
        const tz = activeStep === 'process' ? processTranslation.dz : 0;
        const rotAlpha = activeStep === 'process' ? (processTranslation.alpha * Math.PI) / 180 : 0;

        const convertCoords = (x: number, y: number, z: number): THREE.Vector3 => {
          let rx = x;
          let ry = y;
          if (rotAlpha !== 0) {
            rx = x * Math.cos(rotAlpha) - y * Math.sin(rotAlpha);
            ry = x * Math.sin(rotAlpha) + y * Math.cos(rotAlpha);
          }
          return new THREE.Vector3(rx + tx, z + tz, -ry - ty);
        };

        const elevations = modelData.levels.map(l => l.elevation);
        const minElevation = Math.min(...elevations, 0);
        const maxElevation = Math.max(...elevations, 10);
        const height = maxElevation - minElevation;
        const midElevation = (minElevation + maxElevation) / 2;

        const p1 = convertCoords(grid.p1[0], grid.p1[1], midElevation);
        const p2 = convertCoords(grid.p2[0], grid.p2[1], midElevation);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const length = p1.distanceTo(p2);

        const dir = new THREE.Vector3().subVectors(p2, p1);
        dir.y = 0;
        dir.normalize();

        // Asegurar orientación consistente (evitar vista en espejo si p1 y p2 están invertidos entre modelos o en el JSON original)
        // Si es mayormente vertical (Z domina), asegurar que dir apunte hacia el Norte (-Z)
        // Si es mayormente horizontal (X domina), asegurar que dir apunte hacia el Este (+X)
        if (Math.abs(dir.z) > Math.abs(dir.x)) {
          if (dir.z > 0) {
            dir.multiplyScalar(-1);
          }
        } else {
          if (dir.x < 0) {
            dir.multiplyScalar(-1);
          }
        }

        const normal = new THREE.Vector3(-dir.z, 0, dir.x);

        const distance = Math.max(length, height) * 2;
        const cameraPos = new THREE.Vector3().copy(mid).addScaledVector(normal, distance);

        console.log('[resetZoomAndFrame] Grid coords: length:', length, 'height:', height, 'distance:', distance);
        console.log('[resetZoomAndFrame] Setting target to:', mid, 'cameraPos to:', cameraPos);

        controls.target.copy(mid);
        orthoCamera.zoom = 1;
        orthoCamera.position.copy(cameraPos);
        orthoCamera.lookAt(mid);

        const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
        const dynamicFrustumSize = Math.max(length, height) * 1.25;
        orthoCamera.left = (-dynamicFrustumSize * aspect) / 2;
        orthoCamera.right = (dynamicFrustumSize * aspect) / 2;
        orthoCamera.top = dynamicFrustumSize / 2;
        orthoCamera.bottom = -dynamicFrustumSize / 2;
        orthoCamera.updateProjectionMatrix();
        controls.update();
        console.log('[resetZoomAndFrame] Grid reset done. Camera pos:', orthoCamera.position, 'controls target:', controls.target, 'zoom:', orthoCamera.zoom);
      } else {
        console.warn('[resetZoomAndFrame] Grid, orthoCamera or mountRef is null. grid:', !!grid, 'orthoCamera:', !!orthoCamera);
      }
    } else if (selectedLevelId !== '3d' && modelData) {
      console.log('[resetZoomAndFrame] Entering Floor Plan branch. levelId:', selectedLevelId);
      if (orthoCamera && mountRef.current) {
        const currentLevel = modelData.levels.find(l => l.id === selectedLevelId);
        const elevation = currentLevel ? currentLevel.elevation : 0;

        // Position camera directly above the center of the model at the level height
        controls.target.set(center.x, elevation, center.z);
        orthoCamera.zoom = 1;
        orthoCamera.position.set(center.x, elevation + 100, center.z + 0.001);
        orthoCamera.lookAt(controls.target);

        // Adjust bounds to fit
        const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
        const dynamicFrustumSize = maxDim * 1.5;
        orthoCamera.left = (-dynamicFrustumSize * aspect) / 2;
        orthoCamera.right = (dynamicFrustumSize * aspect) / 2;
        orthoCamera.top = dynamicFrustumSize / 2;
        orthoCamera.bottom = -dynamicFrustumSize / 2;
        orthoCamera.updateProjectionMatrix();
        controls.update();
        console.log('[resetZoomAndFrame] Floor Plan reset done. Camera pos:', orthoCamera.position, 'controls target:', controls.target, 'zoom:', orthoCamera.zoom);
      }
    }
  };

  const handleGoUp = () => {
    if (!sortedLevels.length) return;
    if (selectedLevelId === '3d') {
      handleLevelChange(sortedLevels[0].id);
    } else {
      const idx = sortedLevels.findIndex((l) => l.id === selectedLevelId);
      if (idx === sortedLevels.length - 1) {
        handleLevelChange(sortedLevels[0].id); // loop back to the lowest level
      } else {
        handleLevelChange(sortedLevels[idx + 1].id);
      }
    }
  };

  const handleGoDown = () => {
    if (!sortedLevels.length) return;
    if (selectedLevelId === '3d') {
      handleLevelChange(sortedLevels[sortedLevels.length - 1].id);
    } else {
      const idx = sortedLevels.findIndex((l) => l.id === selectedLevelId);
      if (idx === 0) {
        handleLevelChange(sortedLevels[sortedLevels.length - 1].id); // loop to the highest level
      } else {
        handleLevelChange(sortedLevels[idx - 1].id);
      }
    }
  };

  const isUpDisabled = sortedLevels.length === 0;
  const isDownDisabled = sortedLevels.length === 0;

  // Grid navigation handlers
  const handleGridGoUp = () => {
    if (!sortedGrids.length) return;
    if (selectedGridName === 'none') {
      handleGridChange(sortedGrids[0].name);
    } else {
      const idx = sortedGrids.findIndex((g) => g.name === selectedGridName);
      if (idx === sortedGrids.length - 1) {
        handleGridChange(sortedGrids[0].name); // loop back to the first grid
      } else {
        handleGridChange(sortedGrids[idx + 1].name);
      }
    }
  };

  const handleGridGoDown = () => {
    if (!sortedGrids.length) return;
    if (selectedGridName === 'none') {
      handleGridChange(sortedGrids[sortedGrids.length - 1].name);
    } else {
      const idx = sortedGrids.findIndex((g) => g.name === selectedGridName);
      if (idx === 0) {
        handleGridChange(sortedGrids[sortedGrids.length - 1].name); // loop back to the last grid
      } else {
        handleGridChange(sortedGrids[idx - 1].name);
      }
    }
  };

  const isGridUpDisabled = sortedGrids.length === 0;
  const isGridDownDisabled = sortedGrids.length === 0;

  const handleFaceClick = (face: string) => {
    // Switch to Vista 3D first when clicking ViewCube to restore 3D rotation and elements
    setSelectedLevelId('3d');
    setSelectedGridName('none');

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

  const formatProjectName = (name?: string) => {
    if (!name) return 'Modelo';
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex === -1) return name;
    return name.substring(0, lastDotIndex);
  };

  let viewSubtitle = "Visualización 3D";
  if (selectedLevelId !== '3d' && modelData) {
    const lvl = modelData.levels.find(l => l.id === selectedLevelId);
    viewSubtitle = `Vista en planta ${lvl ? lvl.name : ''}`;
  } else if (selectedGridName !== 'none' && modelData) {
    const hasEje = selectedGridName.toLowerCase().startsWith('eje');
    viewSubtitle = `Vista elevación ${hasEje ? '' : 'eje '}${selectedGridName}`;
  }

  return (
    <div ref={mountRef} className="absolute inset-0 w-full h-full rounded-xl overflow-hidden">
      
      {/* Project Title and Dynamic Subtitle */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none select-none">
        <h2 className="font-headline text-2xl font-bold text-on-surface mb-1">
          {formatProjectName(fileName)}
        </h2>
        <p className="font-body text-sm text-on-surface-variant">{viewSubtitle}</p>
      </div>
      
      {/* Styles for Navigation Cube & Options Column */}
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

        .plan-view-container {
          position: absolute;
          top: 112px; /* Positioned below the ViewCube */
          right: 16px;
          width: 120px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(250, 248, 255, 0.85);
          border: 1.5px solid rgba(0, 74, 198, 0.4);
          border-radius: 8px;
          padding: 8px;
          box-shadow: 0 4px 12px rgba(25, 27, 35, 0.08);
          pointer-events: auto;
          font-family: 'Manrope', sans-serif;
        }
        .elevation-view-container {
          position: absolute;
          top: 216px; /* Positioned below the Plan View card */
          right: 16px;
          width: 120px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(250, 248, 255, 0.85);
          border: 1.5px solid rgba(0, 74, 198, 0.4);
          border-radius: 8px;
          padding: 8px;
          box-shadow: 0 4px 12px rgba(25, 27, 35, 0.08);
          pointer-events: auto;
          font-family: 'Manrope', sans-serif;
        }
        .plan-view-title {
          font-size: 8px;
          font-weight: 800;
          color: #004ac6;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: center;
        }
        .plan-view-select {
          width: 100%;
          font-size: 11px;
          font-weight: 600;
          color: #004ac6;
          background: rgba(250, 248, 255, 0.9);
          border: 1.5px solid rgba(0, 74, 198, 0.3);
          border-radius: 6px;
          padding: 6px 8px;
          cursor: pointer;
          outline: none;
          transition: border-color 0.2s, background-color 0.2s;
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23004ac6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 8px center;
          background-size: 12px;
          padding-right: 24px;
        }
        .plan-view-select:hover {
          background-color: rgba(230, 235, 255, 0.9);
          border-color: #004ac6;
        }
        .plan-view-arrows {
          display: flex;
          gap: 6px;
          width: 100%;
        }
        .arrow-btn {
          flex: 1;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(250, 248, 255, 0.85);
          border: 1.5px solid rgba(0, 74, 198, 0.3);
          border-radius: 6px;
          color: #004ac6;
          cursor: pointer;
          transition: background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.1s;
        }
        .arrow-btn:hover:not(:disabled) {
          background: #004ac6;
          color: #ffffff;
          border-color: #004ac6;
        }
        .arrow-btn:active:not(:disabled) {
          transform: scale(0.95);
        }
        .arrow-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          background: rgba(250, 248, 255, 0.4);
          border-color: rgba(0, 74, 198, 0.2);
          color: rgba(0, 74, 198, 0.4);
        }

        .options-column {
          position: absolute;
          bottom: 16px;
          right: 16px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: auto;
        }
        .option-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(250, 248, 255, 0.85);
          border: 1.5px solid rgba(0, 74, 198, 0.4);
          border-radius: 6px;
          color: #004ac6;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(25, 27, 35, 0.08);
          transition: background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.15s;
        }
        .option-btn:hover {
          background: #004ac6;
          color: #ffffff;
          border-color: #004ac6;
          transform: scale(1.05);
        }
        .option-btn:active {
          transform: scale(0.95);
        }
        .option-btn.active {
          background: #004ac6;
          color: #ffffff;
          border-color: #004ac6;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-up {
          animation: scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
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

      {/* Vistas en Planta Card */}
      {modelData && sortedLevels.length > 0 && (
        <div className="plan-view-container">
          <div className="plan-view-title">Planta</div>
          <select 
            value={selectedLevelId} 
            onChange={(e) => handleLevelChange(e.target.value)}
            className="plan-view-select"
          >
            <option value="3d">Vista 3D</option>
            {sortedLevels.map((lvl) => (
              <option key={lvl.id} value={lvl.id}>
                {lvl.name}
              </option>
            ))}
          </select>
          <div className="plan-view-arrows">
            <button 
              onClick={handleGoDown}
              disabled={isDownDisabled}
              className="arrow-btn"
              title="Bajar nivel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            <button 
              onClick={handleGoUp}
              disabled={isUpDisabled}
              className="arrow-btn"
              title="Subir nivel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Vistas en Elevación Card */}
      {modelData && sortedGrids.length > 0 && (
        <div className="elevation-view-container">
          <div className="plan-view-title">Elevación</div>
          <select 
            value={selectedGridName} 
            onChange={(e) => handleGridChange(e.target.value)}
            className="plan-view-select"
          >
            <option value="none">Vista 3D</option>
            {sortedGrids.map((grid) => (
              <option key={grid.name} value={grid.name}>
                {grid.name}
              </option>
            ))}
          </select>
          <div className="plan-view-arrows">
            <button 
              onClick={handleGridGoDown}
              disabled={isGridDownDisabled}
              className="arrow-btn"
              title="Bajar grilla"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            <button 
              onClick={handleGridGoUp}
              disabled={isGridUpDisabled}
              className="arrow-btn"
              title="Subir grilla"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Modeling Options Column */}
      <div className="options-column">
        {/* Toggle GridHelper */}
        <button 
          onClick={() => setShowGroundGrid(prev => !prev)}
          className={`option-btn ${showGroundGrid ? 'active' : ''}`}
          title={showGroundGrid ? "Ocultar cuadrícula" : "Mostrar cuadrícula"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6h16.5M9 3.75v16.5m6-16.5v16.5" />
          </svg>
        </button>

        {/* Toggle Shadows */}
        <button 
          onClick={() => setEnableShadows(prev => !prev)}
          className={`option-btn ${enableShadows ? 'active' : ''}`}
          title={enableShadows ? "Desactivar sombras" : "Activar sombras"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
            <path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10V2z" />
            <path fill="none" stroke="currentColor" strokeWidth="2" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" />
          </svg>
        </button>

        {/* Toggle Transparency */}
        <button 
          onClick={() => setEnableTransparency(prev => !prev)}
          className={`option-btn ${enableTransparency ? 'active' : ''}`}
          title={enableTransparency ? "Desactivar transparencia" : "Activar transparencia"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <rect x="3" y="3" width="12" height="12" rx="2" />
            <rect x="9" y="9" width="12" height="12" rx="2" strokeDasharray="3 3" />
          </svg>
        </button>

        {/* Toggle Debug Panel */}
        <button 
          onClick={() => setShowDebugPanel(prev => !prev)}
          className={`option-btn ${showDebugPanel ? 'active' : ''}`}
          title={showDebugPanel ? "Ocultar panel de depuración" : "Mostrar panel de depuración"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
          </svg>
        </button>

        {/* Reset Zoom & Fit */}
        <button 
          onClick={resetZoomAndFrame}
          className="option-btn"
          title="Reajustar zoom y encuadrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
          </svg>
        </button>

        {/* Settings / Configuración */}
        <button 
          onClick={() => {
            setTempGridTolerance(gridToleranceMeters);
            setTempVisualizationMode(visualizationMode);
            setIsSettingsOpen(true);
          }}
          className={`option-btn ${isSettingsOpen ? 'active' : ''}`}
          title="Configuración de visualización"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.936 6.936 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
          </svg>
        </button>
      </div>

      {/* Floating Debug Panel */}
      {showDebugPanel && (
        <div className="absolute bottom-4 left-4 bg-black/85 text-white font-mono text-[10px] p-3 rounded-lg border border-white/20 z-50 pointer-events-none max-w-xs select-none shadow-xl">
          <h4 className="font-bold border-b border-white/20 pb-1 mb-1 text-primary-fixed">Three.js Viewport Debug</h4>
          <div>Size: {viewportSize.width}x{viewportSize.height}</div>
          <div>Model Loaded: {modelData ? 'Yes' : 'No'}</div>
          {modelData && (
            <>
              <div>Total Walls: {modelData.elements.walls?.length || 0} (Rendered: {renderedCounts.walls})</div>
              <div>Total Beams: {modelData.elements.beams?.length || 0} (Rendered: {renderedCounts.beams})</div>
              <div>Total Slabs: {modelData.elements.slabs?.length || 0} (Rendered: {renderedCounts.slabs})</div>
              <div>Grids: {modelData.grids?.length || 0} (Visible: {showGrids && filters.elements.grillas ? 'Yes' : 'No'})</div>
              <div>Checked Levels: {filters.levels.filter(l => l.checked).length} / {filters.levels.length}</div>
              <div>Polygons: {polygonCount.toLocaleString()}</div>
            </>
          )}
          {selectedElements.length > 0 && (
            <div className="mt-2 border-t border-white/20 pt-2 text-[10px] text-blue-300">
              <h5 className="font-bold mb-1 text-blue-400">
                {selectedElements.length === 1 
                  ? "Elemento Seleccionado:" 
                  : `${selectedElements.length} Elementos Seleccionados:`}
              </h5>
              {selectedElements.length > 1 && (
                <div className="mb-2 bg-white/5 p-1.5 rounded border border-white/10 space-y-0.5 text-gray-300">
                  <div>Muros: {selectedElements.filter(el => el.type === 'wall').length}</div>
                  <div>Vigas: {selectedElements.filter(el => el.type === 'beam').length}</div>
                  <div>Losas: {selectedElements.filter(el => el.type === 'slab').length}</div>
                </div>
              )}
              {selectedElement && (
                <div className="mt-1">
                  {selectedElements.length > 1 && <div className="text-[9px] text-blue-400 font-bold mb-1 uppercase tracking-wider">Detalle del último seleccionado:</div>}
                  <div>Tipo: {selectedElement.type.toUpperCase()}</div>
                  <div>ID Revit: {selectedElement.id}</div>
                  <div>Sección: {selectedElement.data.section}</div>
                  <div>Nivel: {selectedElement.data.level}</div>
                  {selectedElement.type === 'wall' && (
                    <>
                      <div>Altura: {selectedElement.data.location.height ?? 'N/A'} m</div>
                      {(() => {
                        const outline = selectedElement.data.location.outline;
                        if (outline && outline.length >= 2) {
                          let maxDist = -1;
                          for (let i = 0; i < outline.length; i++) {
                            for (let j = i + 1; j < outline.length; j++) {
                              const dx = outline[i][0] - outline[j][0];
                              const dy = outline[i][1] - outline[j][1];
                              const dist = Math.sqrt(dx * dx + dy * dy);
                              if (dist > maxDist) maxDist = dist;
                            }
                          }
                          return <div>Longitud: {maxDist.toFixed(2)} m</div>;
                        }
                        return null;
                      })()}
                    </>
                  )}
                  {selectedElement.type === 'beam' && selectedElement.data.location.start && selectedElement.data.location.end && (
                    <>
                      {(() => {
                        const start = selectedElement.data.location.start;
                        const end = selectedElement.data.location.end;
                        const dx = end[0] - start[0];
                        const dy = end[1] - start[1];
                        const dz = end[2] - start[2];
                        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        return <div>Longitud: {len.toFixed(2)} m</div>;
                      })()}
                    </>
                  )}
                  {selectedElement.type === 'slab' && (
                    <>
                      {(() => {
                        const outline = selectedElement.data.location.outline;
                        return <div>Vértices: {outline ? outline.length : 0}</div>;
                      })()}
                    </>
                  )}
                  {(() => {
                    const sec = modelData?.sections.find(s => s.code_name === selectedElement.data.section);
                    if (sec) {
                      return (
                        <div className="mt-1 border-t border-white/10 pt-1 text-[9px] text-gray-400">
                          <div>Material: {sec.material}</div>
                          {sec.parameters.thickness !== undefined && <div>Espesor: {sec.parameters.thickness * 1000} mm</div>}
                          {sec.parameters.width !== undefined && <div>Ancho: {sec.parameters.width * 1000} mm</div>}
                          {sec.parameters.height !== undefined && <div>Peralte: {sec.parameters.height * 1000} mm</div>}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>
          )}
          {errorLog && (
            <div className="mt-1 border-t border-red-500/50 pt-1 text-red-400 font-semibold max-h-24 overflow-y-auto">
               Error: {errorLog}
            </div>
          )}
        </div>
      )}

      {/* Selection Box Overlay */}
      {selectionBox && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(selectionBox.startX, selectionBox.currentX) - (mountRef.current?.getBoundingClientRect().left || 0),
            top: Math.min(selectionBox.startY, selectionBox.currentY) - (mountRef.current?.getBoundingClientRect().top || 0),
            width: Math.abs(selectionBox.startX - selectionBox.currentX),
            height: Math.abs(selectionBox.startY - selectionBox.currentY),
            pointerEvents: 'none',
            border: selectionBox.startX <= selectionBox.currentX
              ? '1.5px solid #2563eb' // Window: Solid Blue
              : '1.5px dashed #10b981', // Crossing: Dashed Green
            backgroundColor: selectionBox.startX <= selectionBox.currentX
              ? 'rgba(37, 99, 235, 0.15)'
              : 'rgba(16, 185, 129, 0.15)',
            zIndex: 1000
          }}
        />
      )}

      {/* Options Palette Floating Popup */}
      {optionPalette && optionPalette.visible && (
        <div
          style={{
            position: 'absolute',
            left: optionPalette.x - (mountRef.current?.getBoundingClientRect().left || 0),
            top: optionPalette.y - (mountRef.current?.getBoundingClientRect().top || 0) + 12,
            zIndex: 1010
          }}
          className="bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-lg p-1.5 shadow-2xl flex items-center space-x-1 animate-fade-in pointer-events-auto select-none min-w-[200px]"
        >
          <span className="text-[10px] text-gray-400 font-bold px-1.5 border-r border-slate-800">
            {selectedElements.length === 1 ? optionPalette.elementId : `${selectedElements.length} sel.`}
          </span>
          <button
            onClick={() => {
              const newHidden = new Set(hiddenElementIds);
              selectedElements.forEach(el => newHidden.add(el.id));
              setHiddenElementIds(newHidden);
              setSelectedElements([]);
              setOptionPalette(null);
            }}
            className="text-[10px] text-white hover:bg-red-500/20 hover:text-red-300 px-2 py-1 rounded transition font-medium"
            title="Ocultar elementos seleccionados en la vista"
          >
            Ocultar
          </button>
          <button
            onClick={() => {
              const newHidden = new Set<string>(hiddenElementIds);
              sceneInstance?.traverse((obj) => {
                if (obj.userData && obj.userData.id && (obj.userData.type === 'wall' || obj.userData.type === 'beam' || obj.userData.type === 'slab')) {
                  if (!selectedElements.some(el => el.id === obj.userData.id)) {
                    newHidden.add(obj.userData.id);
                  }
                }
              });
              setHiddenElementIds(newHidden);
              setSelectedElements(selectedElements); // refresh selection
              setOptionPalette(null);
            }}
            className="text-[10px] text-white hover:bg-blue-500/20 hover:text-blue-300 px-2 py-1 rounded transition font-medium"
            title="Aislar elementos seleccionados (oculta todo lo demás)"
          >
            Aislar
          </button>
          <button
            onClick={() => {
              setSelectedElements([]);
              setOptionPalette(null);
            }}
            className="text-[10px] text-gray-400 hover:bg-slate-800 hover:text-white px-2 py-1 rounded transition font-medium"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Restore Hidden Elements Button */}
      {hiddenElementIds.size > 0 && (
        <button
          onClick={() => {
            setHiddenElementIds(new Set());
            setSelectedElements([]);
            setOptionPalette(null);
          }}
          className="absolute bottom-4 right-16 z-50 bg-amber-600/90 hover:bg-amber-500 text-white backdrop-blur-sm border border-amber-500/50 rounded-lg px-3 py-1.5 shadow-xl text-xs font-semibold flex items-center space-x-1.5 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.43 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span>Restaurar {hiddenElementIds.size} ocultos</span>
        </button>
      )}

      {/* Settings Modal (Configuración de Visualización) */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-[2000] flex items-center justify-center pointer-events-auto transition-all animate-fade-in">
          <div className="bg-background border border-outline-variant/30 rounded-2xl w-full max-w-sm p-5 shadow-2xl animate-scale-up select-none flex flex-col pointer-events-auto mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3 mb-4">
              <div className="flex items-center space-x-2 text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.936 6.936 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                </svg>
                <h3 className="text-sm font-bold text-on-surface font-headline">Configuración de Visualización</h3>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-on-surface-variant/70 hover:text-on-surface hover:bg-outline-variant/10 p-1 rounded-lg transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 space-y-4">
              {/* Parameter "Visualizar" */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  Visualizar
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'espesores', label: 'Espesores', icon: 'M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m9-4.5L12 16.5m0 0l4.5 4.5M12 16.5V3' },
                    { value: 'material', label: 'Material', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
                    { value: 'tipo', label: 'Tipo', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTempVisualizationMode(opt.value)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                        tempVisualizationMode === opt.value
                          ? 'bg-primary/5 border-primary text-primary font-bold shadow-sm'
                          : 'bg-surface border-outline-variant/30 text-on-surface-variant/80 hover:bg-outline-variant/5'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mb-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                      </svg>
                      <span className="text-[10px]">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameter "Profundidad de búsqueda en ejes" */}
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/10">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Profundidad en ejes
                  </label>
                  <span className="text-[10px] font-extrabold text-primary px-2 py-0.5 bg-primary/10 rounded-full font-mono">
                    {getFormattedTolerance(tempGridTolerance)}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant/80 leading-normal">
                  Ajusta la tolerancia para asociar elementos constructivos con el eje seleccionado.
                </p>
                
                <div className="pt-1.5 flex items-center space-x-3">
                  <span className="text-[10px] font-semibold text-on-surface-variant/40">5 mm</span>
                  <input
                    type="range"
                    min="0.005"
                    max="1.500"
                    step="0.005"
                    value={tempGridTolerance}
                    onChange={(e) => setTempGridTolerance(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-outline-variant/30 rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                  />
                  <span className="text-[10px] font-semibold text-on-surface-variant/40">1.5 m</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2.5 border-t border-outline-variant/15 pt-3 mt-4">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-3 py-1.5 border border-outline-variant/40 rounded-lg text-[11px] font-bold text-on-surface hover:bg-outline-variant/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setGridToleranceMeters(tempGridTolerance);
                  setVisualizationMode(tempVisualizationMode);
                  setIsSettingsOpen(false);
                }}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-[11px] font-bold shadow-md transition-all active:scale-[0.97]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Floating Hover Tooltip for Grids and Levels */}
      {hoverTooltip && hoverTooltip.visible && (
        <div
          className="absolute pointer-events-none z-[1000] rounded px-2.5 py-1 text-[11px] font-bold font-body shadow-lg border backdrop-blur-md"
          style={{
            left: `${hoverTooltip.x}px`,
            top: `${hoverTooltip.y}px`,
            transform: 'translate(-50%, -130%)',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            color: '#ffffff',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            whiteSpace: 'nowrap'
          }}
        >
          {hoverTooltip.text}
        </div>
      )}
    </div>
  );
};
export default ThreeViewport;
