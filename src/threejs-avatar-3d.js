// ============================================
// threejs-avatar-3d.js - REPLIKA STYLE
// Beautiful rotating environment + Natural idle pose
// NO T-POSE - Arms hang naturally at sides
// All animations retained: blink, head, breathing, gestures
// ============================================

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ============================================
// GLOBAL VARIABLES
// ============================================
let scene, camera, renderer, controls;
let currentVRM = null;
let avatarReady = false;
let isTalking = false;
let clock = new THREE.Clock();
let container = null;
let rafId = null;

// Scene objects
let currentRoom = null;
let fallbackGround = null;
let fallbackSky = null;
let hasRoomLoaded = false;

// Animation timers
let idleTime = 0;
let blinkTimer = 0;
let gestureTimer = 0;
let lookTimer = 0;
let lookTarget = { x: 0, y: 0 };
let currentLook = { x: 0, y: 0 };
let swayTime = 0;

// Lip sync
let currentMouthOpenness = 0;
let targetMouthOpenness = 0;

// Gesture state
let isGesturing = false;
let gestureProgress = 0;
let gestureType = 0;

// Talking gesture state
let talkingGestureTimer = 0;
let currentTalkingGesture = -1;
let talkingGestureProgress = 0;

// Wave state
let isWaving = false;
let waveProgress = 0;

// Nod state
let isNodding = false;
let nodProgress = 0;

// ============================================
// BASE ROTATIONS - FIXED NATURAL POSE
// Arms hanging DOWN at sides (NOT T-pose!)
// 
// VRM Coordinate System:
// - X rotation: forward/backward
// - Y rotation: twist
// - Z rotation: sideways (THIS IS KEY FOR ARMS)
//   - Right arm: NEGATIVE Z = arm goes DOWN
//   - Left arm: POSITIVE Z = arm goes DOWN
// ============================================
const baseRotations = {
  // Right arm - hanging down naturally
  // Z must be strongly negative to bring arm down from T-pose
  rightUpperArm: { x: 0.2, y: 0, z: -1.2 },      // Z=-1.2 brings arm DOWN
  rightLowerArm: { x: 0, y: 0, z: 0.1 },          // Slight bend
  rightHand: { x: 0, y: 0, z: 0 },
  
  // Left arm - hanging down naturally  
  // Z must be strongly positive to bring arm down from T-pose
  leftUpperArm: { x: 0.2, y: 0, z: 1.2 },         // Z=+1.2 brings arm DOWN
  leftLowerArm: { x: 0, y: 0, z: -0.1 },          // Slight bend
  leftHand: { x: 0, y: 0, z: 0 },
  
  // Body - natural stance
  hips: { x: 0, y: 0, z: 0 },
  spine: { x: 0.02, y: 0, z: 0 },
};

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  // Avatar
  avatarHeight: 1.45,
  
  // Camera - Replika style (closer, more intimate)
  cameraX: 0,
  cameraY: 1.35,
  cameraZ: 2.0,
  lookAtX: 0,
  lookAtY: 1.2,
  lookAtZ: 0,
  cameraFOV: 55,
  
  // Mouse controls
  controlsMinDistance: 1.5,
  controlsMaxDistance: 3.5,
  controlsMaxPolarAngle: Math.PI / 1.8,
  controlsMinPolarAngle: Math.PI / 3,
  controlsEnablePan: false,
  controlsDampingFactor: 0.05,
  
  // Avatar position
  avatarX: 0,
  avatarY: 0,
  avatarZ: 0,
  
  // Room
  roomScale: 1.1,
  roomX: 0,
  roomY: -0.2,
  roomZ: -2,
  
  // Colors - Warmer, more inviting
  skyTopColor: 0xB8A8D4,
  skyMidColor: 0xD4C4E8,
  skyBottomColor: 0xF0E8F8,
  floorCenterColor: 0xF5F0FA,
  floorEdgeColor: 0xD8CFE5,
  
  // Breathing - more pronounced
  breathingSpeed: 0.5,
  breathingAmount: 0.008,
  shoulderBreathAmount: 0.003,
  
  // Body sway - more natural movement
  bodySwaySpeed: 0.3,
  bodySwayAmount: 0.01,
  hipSwayAmount: 0.004,
  
  // Head/Look - more engaged
  lookAtViewerChance: 0.9,
  lookAwayInterval: 4000,
  lookAwayDuration: 1200,
  lookAmountX: 0.15,
  lookAmountY: 0.1,
  lookSmoothing: 0.05,
  headTiltAmount: 0.06,
  
  // Arm sway (idle) - subtle natural movement
  armSwayAmount: 0.015,
  armSwaySpeed: 0.25,
  
  // Idle gestures - more frequent, natural
  gestureInterval: 6000,
  gestureDuration: 2000,
  gestureAmount: 0.2,
  
  // Talking gestures
  talkingGestureInterval: 1500,
  talkingGestureAmount: 0.25,
  talkingGestureDuration: 1000,
  
  // Wave
  waveDuration: 2200,
  waveSpeed: 14,
  
  // Nod
  nodDuration: 500,
  nodAmount: 0.12,
  
  // Blink - more natural
  blinkInterval: 3000,
  blinkVariation: 2000,
  blinkDuration: 120,
  doubleBinkChance: 0.3,
  
  // Lip sync
  lipSyncSmooth: 0.18,
  lipSyncIntensity: 0.9,
  talkingSmileAmount: 0.15,
};

// ============================================
// EASING FUNCTIONS
// ============================================
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutBack(t) { 
  const c1 = 1.70158; 
  const c3 = c1 + 1; 
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); 
}

// ============================================
// INITIALIZE 3D SCENE
// ============================================
export function init3DScene(containerId = "canvas-container") {
  container = document.getElementById(containerId);
  if (!container) {
    console.error("[3D] Container not found:", containerId);
    return false;
  }

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  container.querySelectorAll("canvas").forEach(c => c.remove());

  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  createFallbackEnvironment();
  
  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  
  camera.position.set(CONFIG.cameraX, CONFIG.cameraY, CONFIG.cameraZ);
  camera.lookAt(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ);
  
  // Setup OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ);
  controls.enableDamping = true;
  controls.dampingFactor = CONFIG.controlsDampingFactor;
  controls.enablePan = CONFIG.controlsEnablePan;
  controls.minDistance = CONFIG.controlsMinDistance;
  controls.maxDistance = CONFIG.controlsMaxDistance;
  controls.maxPolarAngle = CONFIG.controlsMaxPolarAngle;
  controls.minPolarAngle = CONFIG.controlsMinPolarAngle;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.5;
  controls.rotateSpeed = 0.5;
  
  setupLights();
  window.addEventListener("resize", onResize, { passive: true });
  animate();

  console.log("[3D] ✅ Scene ready! Replika-style mode");
  return true;
}

// ============================================
// CREATE FALLBACK ENVIRONMENT
// ============================================
function createFallbackEnvironment() {
  const skyGeo = new THREE.SphereGeometry(50, 64, 64);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(CONFIG.skyTopColor) },
      midColor: { value: new THREE.Color(CONFIG.skyMidColor) },
      bottomColor: { value: new THREE.Color(CONFIG.skyBottomColor) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 color;
        if (h > 0.0) {
          color = mix(midColor, topColor, smoothstep(0.0, 0.8, h));
        } else {
          color = mix(bottomColor, midColor, smoothstep(-0.3, 0.0, h));
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  
  fallbackSky = new THREE.Mesh(skyGeo, skyMat);
  fallbackSky.visible = true;
  scene.add(fallbackSky);

  const groundGeo = new THREE.PlaneGeometry(60, 60, 1, 1);
  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      centerColor: { value: new THREE.Color(CONFIG.floorCenterColor) },
      edgeColor: { value: new THREE.Color(CONFIG.floorEdgeColor) },
      avatarPos: { value: new THREE.Vector2(0.5, 0.5) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 centerColor;
      uniform vec3 edgeColor;
      uniform vec2 avatarPos;
      varying vec2 vUv;
      void main() {
        float dist = distance(vUv, avatarPos);
        float gradient = smoothstep(0.0, 0.6, dist);
        vec3 color = mix(centerColor, edgeColor, gradient);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  
  fallbackGround = new THREE.Mesh(groundGeo, groundMat);
  fallbackGround.rotation.x = -Math.PI / 2;
  fallbackGround.position.y = -0.01;
  fallbackGround.receiveShadow = true;
  fallbackGround.visible = true;
  scene.add(fallbackGround);
}

// ============================================
// SETUP LIGHTING
// ============================================
function setupLights() {
  const mainLight = new THREE.DirectionalLight(0xFFF5E6, 1.0);
  mainLight.position.set(3, 6, 4);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 50;
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xFFE4F0, 0.5);
  fillLight.position.set(-4, 3, 2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xE8D4FF, 0.4);
  rimLight.position.set(0, 4, -4);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  scene.add(new THREE.HemisphereLight(0xD8C8F0, 0xF0E4F8, 0.6));
}

// ============================================
// LOAD VRM AVATAR
// ============================================
export async function loadVRMAvatar(vrmPath) {
  console.log("[3D] Loading:", vrmPath);

  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.classList.add("active");

  if (currentVRM) {
    scene.remove(currentVRM.scene);
    VRMUtils.deepDispose(currentVRM.scene);
    currentVRM = null;
    avatarReady = false;
  }

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      vrmPath,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        
        if (!vrm) {
          if (loadingEl) loadingEl.classList.remove("active");
          reject(new Error("No VRM data"));
          return;
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        vrm.scene.rotation.y = Math.PI;

        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const scale = CONFIG.avatarHeight / size.y;
        vrm.scene.scale.setScalar(scale);

        vrm.scene.position.set(
          CONFIG.avatarX - center.x * scale,
          CONFIG.avatarY - box.min.y * scale,
          CONFIG.avatarZ - center.z * scale
        );

        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        scene.add(vrm.scene);
        
        currentVRM = vrm;
        avatarReady = true;

        // Reset state
        resetAnimationState();
        
        // CRITICAL: Set natural idle pose immediately (NO T-POSE!)
        setNaturalIdlePose(vrm);

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Avatar ready! Natural pose set (arms down)");
        
        // Subtle happy expression on load
        setTimeout(() => {
          if (avatarReady) {
            setExpression("happy", 0.2, 3000);
          }
        }, 600);
        
        resolve(vrm);
      },
      undefined,
      (error) => {
        if (loadingEl) loadingEl.classList.remove("active");
        reject(error);
      }
    );
  });
}

function resetAnimationState() {
  idleTime = 0;
  swayTime = 0;
  blinkTimer = 0;
  gestureTimer = 0;
  lookTimer = 0;
  talkingGestureTimer = 0;
  lookTarget = { x: 0, y: 0 };
  currentLook = { x: 0, y: 0 };
  isGesturing = false;
  isWaving = false;
  isNodding = false;
  currentTalkingGesture = -1;
}

// ============================================
// SET NATURAL IDLE POSE - ARMS DOWN!
// This is called once on avatar load to set the base pose
// ============================================
function setNaturalIdlePose(vrm) {
  if (!vrm?.humanoid) return;
  
  const get = (name) => vrm.humanoid.getNormalizedBoneNode(name);
  
  // ===== RIGHT ARM - Down at side =====
  const rUA = get("rightUpperArm");
  const rLA = get("rightLowerArm");
  const rH = get("rightHand");
  
  if (rUA) {
    rUA.rotation.x = baseRotations.rightUpperArm.x;
    rUA.rotation.y = baseRotations.rightUpperArm.y;
    rUA.rotation.z = baseRotations.rightUpperArm.z;  // -1.2 = arm DOWN
  }
  if (rLA) {
    rLA.rotation.x = baseRotations.rightLowerArm.x;
    rLA.rotation.y = baseRotations.rightLowerArm.y;
    rLA.rotation.z = baseRotations.rightLowerArm.z;
  }
  if (rH) {
    rH.rotation.x = baseRotations.rightHand.x;
    rH.rotation.y = baseRotations.rightHand.y;
    rH.rotation.z = baseRotations.rightHand.z;
  }
  
  // ===== LEFT ARM - Down at side =====
  const lUA = get("leftUpperArm");
  const lLA = get("leftLowerArm");
  const lH = get("leftHand");
  
  if (lUA) {
    lUA.rotation.x = baseRotations.leftUpperArm.x;
    lUA.rotation.y = baseRotations.leftUpperArm.y;
    lUA.rotation.z = baseRotations.leftUpperArm.z;   // +1.2 = arm DOWN
  }
  if (lLA) {
    lLA.rotation.x = baseRotations.leftLowerArm.x;
    lLA.rotation.y = baseRotations.leftLowerArm.y;
    lLA.rotation.z = baseRotations.leftLowerArm.z;
  }
  if (lH) {
    lH.rotation.x = baseRotations.leftHand.x;
    lH.rotation.y = baseRotations.leftHand.y;
    lH.rotation.z = baseRotations.leftHand.z;
  }
  
  // ===== BODY =====
  const hips = get("hips");
  const spine = get("spine");
  
  if (hips) {
    hips.rotation.x = baseRotations.hips.x;
    hips.rotation.y = baseRotations.hips.y;
    hips.rotation.z = baseRotations.hips.z;
  }
  if (spine) {
    spine.rotation.x = baseRotations.spine.x;
    spine.rotation.y = baseRotations.spine.y;
    spine.rotation.z = baseRotations.spine.z;
  }
  
  console.log("[3D] ✅ Natural idle pose applied (arms at sides)");
}

// ============================================
// LOAD ROOM MODEL
// ============================================
export async function loadRoomModel(glbPath) {
  if (currentRoom) {
    scene.remove(currentRoom);
    currentRoom = null;
  }

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      glbPath,
      (gltf) => {
        const room = gltf.scene;
        room.scale.setScalar(CONFIG.roomScale);
        
        const box = new THREE.Box3().setFromObject(room);
        const center = box.getCenter(new THREE.Vector3());
        
        room.position.set(
          CONFIG.roomX - center.x,
          CONFIG.roomY - box.min.y,
          CONFIG.roomZ - center.z
        );

        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj.material) obj.material.side = THREE.DoubleSide;
          }
        });

        scene.add(room);
        currentRoom = room;
        hasRoomLoaded = true;
        console.log("[3D] ✅ Room loaded");
        resolve(room);
      },
      undefined,
      (error) => {
        useFallbackEnvironment();
        reject(error);
      }
    );
  });
}

export function useFallbackEnvironment() {
  if (currentRoom) { scene.remove(currentRoom); currentRoom = null; }
  hasRoomLoaded = false;
  if (fallbackSky) fallbackSky.visible = true;
  if (fallbackGround) fallbackGround.visible = true;
}

// ============================================
// CAMERA & POSITION CONTROLS
// ============================================
export function setCameraPosition(x, y, z) {
  if (camera) { 
    camera.position.set(x, y, z); 
    camera.lookAt(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ); 
  }
}

export function setCameraLookAt(x, y, z) { if (camera) camera.lookAt(x, y, z); }
export function setCameraFOV(fov) { if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); } }

export function setAvatarPosition(x, y, z) {
  if (currentVRM) { 
    const box = new THREE.Box3().setFromObject(currentVRM.scene); 
    currentVRM.scene.position.set(x, y - box.min.y, z); 
  }
}

export function setRoomPosition(x, y, z) {
  if (currentRoom) { 
    const box = new THREE.Box3().setFromObject(currentRoom); 
    currentRoom.position.set(x, y - box.min.y, z); 
  }
}

export function setRoomScale(s) {
  if (currentRoom) { 
    currentRoom.scale.setScalar(s); 
    const box = new THREE.Box3().setFromObject(currentRoom); 
    currentRoom.position.y = -box.min.y; 
  }
}

// ============================================
// TRIGGER WAVE - Manual call only
// ============================================
export function triggerWave() {
  if (!avatarReady || isWaving) return;
  isWaving = true;
  waveProgress = 0;
  console.log("[3D] 👋 Waving!");
}

// ============================================
// UPDATE WAVE ANIMATION
// ============================================
function updateWaveAnimation(delta) {
  if (!isWaving || !currentVRM?.humanoid) return;

  waveProgress += delta * 1000;
  const duration = CONFIG.waveDuration;
  const progress = Math.min(waveProgress / duration, 1);

  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);

  const rUA = get("rightUpperArm");
  const rLA = get("rightLowerArm");
  const rH  = get("rightHand");

  let raise;
  if (progress < 0.2) {
    raise = easeOutBack(progress / 0.2);
  } else if (progress < 0.75) {
    raise = 1.0;
  } else {
    raise = 1.0 - easeInOutCubic((progress - 0.75) / 0.25);
  }

  if (rUA) {
    // Raise arm from natural position
    rUA.rotation.x = baseRotations.rightUpperArm.x - raise * 1.2;
    rUA.rotation.y = baseRotations.rightUpperArm.y + raise * 0.1;
    rUA.rotation.z = baseRotations.rightUpperArm.z + raise * 1.5;  // Go from -1.2 to ~+0.3
  }

  if (rLA) {
    rLA.rotation.x = -raise * 1.2;
    rLA.rotation.y = raise * 0.2;
    rLA.rotation.z = baseRotations.rightLowerArm.z;
  }

  if (rH) {
    rH.rotation.y = 1.57 * raise;
    rH.rotation.x = -0.3 * raise;
    
    if (progress > 0.2 && progress < 0.75) {
      const waveTime = waveProgress * 0.001 * CONFIG.waveSpeed;
      rH.rotation.z = Math.sin(waveTime) * 0.7;
    } else {
      rH.rotation.z = 0;
    }
  }

  if (progress >= 1) {
    isWaving = false;
    waveProgress = 0;

    // Return to natural pose
    if (rUA) rUA.rotation.set(
      baseRotations.rightUpperArm.x,
      baseRotations.rightUpperArm.y,
      baseRotations.rightUpperArm.z
    );
    if (rLA) rLA.rotation.set(
      baseRotations.rightLowerArm.x,
      baseRotations.rightLowerArm.y,
      baseRotations.rightLowerArm.z
    );
    if (rH) rH.rotation.set(
      baseRotations.rightHand.x,
      baseRotations.rightHand.y,
      baseRotations.rightHand.z
    );
    console.log("[3D] 👋 Wave complete");
  }
}

// ============================================
// TRIGGER NOD
// ============================================
export function triggerNod() {
  if (!avatarReady || isNodding) return;
  isNodding = true;
  nodProgress = 0;
}

function updateNodAnimation(delta) {
  if (!isNodding || !currentVRM?.humanoid) return;
  
  nodProgress += delta * 1000;
  const duration = CONFIG.nodDuration * 2;
  const progress = nodProgress / duration;
  
  const nodCycle = Math.sin(progress * Math.PI * 4);
  const envelope = Math.sin(progress * Math.PI);
  const nod = nodCycle * envelope * CONFIG.nodAmount;
  
  const head = currentVRM.humanoid.getNormalizedBoneNode("head");
  if (head) {
    head.rotation.x = currentLook.y + nod;
  }
  
  if (progress >= 1) isNodding = false;
}

// ============================================
// IDLE ANIMATION - Main update
// All animations run here: breathing, sway, head, gestures
// ============================================
function updateIdleAnimation(delta) {
  if (!currentVRM || !avatarReady) return;
  
  idleTime += delta;
  swayTime += delta;
  
  updateBreathing();
  updateBodySway();
  updateHeadMovement(delta);
  
  if (!isWaving) {
    if (isTalking) {
      updateTalkingGestures(delta);
    } else {
      updateArmSway();
      updateIdleGestures(delta);
    }
  }
}

// ============================================
// BREATHING
// ============================================
function updateBreathing() {
  if (!currentVRM?.humanoid) return;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  
  const breathCycle = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2);
  const breath = breathCycle * CONFIG.breathingAmount;
  
  const chest = get("chest");
  const upperChest = get("upperChest");
  const spine = get("spine");
  
  if (upperChest) upperChest.rotation.x = breath * 1.5;
  if (chest) chest.rotation.x = breath;
  if (spine) spine.rotation.x = baseRotations.spine.x + breath * 0.3;
  
  const lS = get("leftShoulder"), rS = get("rightShoulder");
  if (lS) lS.position.y = breathCycle * CONFIG.shoulderBreathAmount;
  if (rS) rS.position.y = breathCycle * CONFIG.shoulderBreathAmount;
}

// ============================================
// BODY SWAY
// ============================================
function updateBodySway() {
  if (!currentVRM?.humanoid) return;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  
  const sway = Math.sin(swayTime * CONFIG.bodySwaySpeed * Math.PI * 2);
  const sway2 = Math.sin(swayTime * CONFIG.bodySwaySpeed * 0.7 * Math.PI * 2);
  
  const hips = get("hips");
  const spine = get("spine");
  
  if (hips) {
    hips.rotation.y = baseRotations.hips.y + sway * CONFIG.hipSwayAmount;
    hips.position.x = sway * 0.003;
  }
  
  if (spine) {
    spine.rotation.z = sway2 * CONFIG.bodySwayAmount;
  }
}

// ============================================
// HEAD MOVEMENT - Natural looking around
// ============================================
function updateHeadMovement(delta) {
  if (!currentVRM?.humanoid) return;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  const head = get("head");
  const neck = get("neck");
  
  if (!head) return;

  lookTimer += delta * 1000;

  if (lookTimer > CONFIG.lookAwayInterval + Math.random() * 2000) {
    if (Math.random() < CONFIG.lookAtViewerChance) {
      lookTarget.x = (Math.random() - 0.5) * 0.06;
      lookTarget.y = (Math.random() - 0.5) * 0.05;
    } else {
      lookTarget.x = (Math.random() - 0.5) * 2 * CONFIG.lookAmountX;
      lookTarget.y = (Math.random() - 0.5) * 2 * CONFIG.lookAmountY;
    }
    lookTimer = 0;
  }

  if (lookTimer > CONFIG.lookAwayDuration && (Math.abs(lookTarget.x) > 0.08 || Math.abs(lookTarget.y) > 0.06)) {
    lookTarget.x *= 0.95;
    lookTarget.y *= 0.95;
  }

  currentLook.x += (lookTarget.x - currentLook.x) * CONFIG.lookSmoothing;
  currentLook.y += (lookTarget.y - currentLook.y) * CONFIG.lookSmoothing;

  if (!isNodding) {
    head.rotation.y = currentLook.x;
    head.rotation.x = currentLook.y;
    head.rotation.z = Math.sin(idleTime * 0.4) * CONFIG.headTiltAmount;
  }

  if (neck) {
    neck.rotation.y = currentLook.x * 0.4;
    neck.rotation.x = currentLook.y * 0.3;
  }
}

// ============================================
// ARM SWAY - Subtle idle movement
// Arms sway slightly while maintaining down position
// ============================================
function updateArmSway() {
  if (!currentVRM?.humanoid || isGesturing || isWaving) return;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  const lUA = get("leftUpperArm"), rUA = get("rightUpperArm");
  
  const sway = Math.sin(idleTime * CONFIG.armSwaySpeed) * CONFIG.armSwayAmount;
  const sway2 = Math.cos(idleTime * CONFIG.armSwaySpeed * 0.7) * CONFIG.armSwayAmount * 0.5;
  
  if (lUA) {
    lUA.rotation.x = baseRotations.leftUpperArm.x + sway2;
    lUA.rotation.z = baseRotations.leftUpperArm.z + sway;  // Sway around +1.2
  }
  
  if (rUA) {
    rUA.rotation.x = baseRotations.rightUpperArm.x - sway2;
    rUA.rotation.z = baseRotations.rightUpperArm.z - sway;  // Sway around -1.2
  }
}

// ============================================
// IDLE GESTURES
// ============================================
function updateIdleGestures(delta) {
  if (!currentVRM?.humanoid || isWaving) return;

  gestureTimer += delta * 1000;

  if (!isGesturing && gestureTimer > CONFIG.gestureInterval + Math.random() * 3000) {
    isGesturing = true;
    gestureProgress = 0;
    gestureTimer = 0;
    gestureType = Math.floor(Math.random() * 6);
  }

  if (isGesturing) {
    gestureProgress += delta * 1000;
    const progress = gestureProgress / CONFIG.gestureDuration;
    const ease = Math.sin(progress * Math.PI);
    
    applyIdleGesture(ease);

    if (gestureProgress >= CONFIG.gestureDuration) {
      isGesturing = false;
    }
  }
}

function applyIdleGesture(intensity) {
  if (isWaving) return;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  const amt = CONFIG.gestureAmount * intensity;
  
  const rUA = get("rightUpperArm"), rLA = get("rightLowerArm");
  const lUA = get("leftUpperArm"), lLA = get("leftLowerArm");
  
  switch (gestureType) {
    case 0: // Touch face - lift arm slightly
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.5;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.8;  // Lift from -1.2
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y + amt * 0.6;
      break;
      
    case 1: // Both arms forward slightly
      if (rUA) rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.3;
      if (lUA) lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.3;
      break;
      
    case 2: // Hand behind head
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.4;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.6;
      }
      if (rLA) rLA.rotation.x = -amt * 0.5;
      break;
      
    case 3: // Adjust hair
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.4;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.6;
      }
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y - amt * 0.5;
      break;
      
    case 4: // Cross arms slightly
      if (rUA) rUA.rotation.y = amt * 0.3;
      if (lUA) lUA.rotation.y = -amt * 0.3;
      break;
      
    case 5: // Fidget with hands
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y + amt * 0.3;
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y - amt * 0.3;
      break;
  }
}

// ============================================
// TALKING GESTURES
// ============================================
function updateTalkingGestures(delta) {
  if (!currentVRM?.humanoid || !isTalking || isWaving) return;
  
  talkingGestureTimer += delta * 1000;
  
  if (currentTalkingGesture === -1 || talkingGestureTimer > CONFIG.talkingGestureInterval) {
    currentTalkingGesture = Math.floor(Math.random() * 8);
    talkingGestureTimer = 0;
    talkingGestureProgress = 0;
  }
  
  talkingGestureProgress += delta * 1000;
  const duration = CONFIG.talkingGestureDuration;
  
  let intensity;
  if (talkingGestureProgress < duration * 0.2) {
    intensity = easeOutCubic(talkingGestureProgress / (duration * 0.2));
  } else if (talkingGestureProgress < duration * 0.6) {
    intensity = 1;
  } else if (talkingGestureProgress < duration) {
    intensity = 1 - easeInCubic((talkingGestureProgress - duration * 0.6) / (duration * 0.4));
  } else {
    intensity = 0;
  }
  
  applyTalkingGesture(intensity);
}

function applyTalkingGesture(intensity) {
  if (isWaving) return;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  const amt = CONFIG.talkingGestureAmount * intensity;
  const v = Math.sin(idleTime * 6) * 0.04;
  
  const rUA = get("rightUpperArm"), rLA = get("rightLowerArm"), rH = get("rightHand");
  const lUA = get("leftUpperArm"), lLA = get("leftLowerArm");
  const lS = get("leftShoulder"), rS = get("rightShoulder");
  
  switch (currentTalkingGesture) {
    case 0: // Right forward - lift arm to gesture
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.4;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.7;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y + amt * 0.4;
      if (rH) rH.rotation.x = -amt * 0.2 + v;
      break;
      
    case 1: // Left forward
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.4;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.7;
      }
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y - amt * 0.4;
      break;
      
    case 2: // Both open
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.35;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.6;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.35;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.6;
      }
      break;
      
    case 3: // Point
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.6;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.8;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y + amt * 0.45;
      break;
      
    case 4: // Hands together
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.4;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.5;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.4;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.5;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y + amt * 0.5;
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y - amt * 0.5;
      break;
      
    case 5: // Reach
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.55;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.6;
      }
      if (rLA) {
        rLA.rotation.x = -amt * 0.2;
        rLA.rotation.y = baseRotations.rightLowerArm.y + amt * 0.35;
      }
      break;
      
    case 6: // Shrug
      if (lS) lS.position.y = amt * 0.02;
      if (rS) rS.position.y = amt * 0.02;
      if (rUA) rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.25;
      if (lUA) lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.25;
      break;
      
    case 7: // Emphatic
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.45;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.55;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.45;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.55;
      }
      break;
  }
}

// ============================================
// BLINKING - Natural eye blinks
// ============================================
function updateBlinking(delta) {
  if (!currentVRM?.expressionManager) return;

  blinkTimer += delta * 1000;
  const interval = CONFIG.blinkInterval + Math.random() * CONFIG.blinkVariation;

  if (blinkTimer >= interval) {
    const expr = currentVRM.expressionManager;
    
    if (expr.expressionMap["blink"]) {
      expr.setValue("blink", 1.0);
      
      setTimeout(() => {
        if (currentVRM?.expressionManager?.expressionMap["blink"]) {
          currentVRM.expressionManager.setValue("blink", 0.0);
          
          if (Math.random() < CONFIG.doubleBinkChance) {
            setTimeout(() => {
              if (currentVRM?.expressionManager?.expressionMap["blink"]) {
                currentVRM.expressionManager.setValue("blink", 1.0);
                setTimeout(() => {
                  if (currentVRM?.expressionManager?.expressionMap["blink"]) {
                    currentVRM.expressionManager.setValue("blink", 0.0);
                  }
                }, CONFIG.blinkDuration);
              }
            }, 150);
          }
        }
      }, CONFIG.blinkDuration);
    }
    
    blinkTimer = 0;
  }
}

// ============================================
// LIP SYNC
// ============================================
function updateLipSync() {
  if (!currentVRM?.expressionManager) return;

  currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * CONFIG.lipSyncSmooth;

  const expr = currentVRM.expressionManager;
  const intensity = CONFIG.lipSyncIntensity;
  
  if (expr.expressionMap["aa"]) expr.setValue("aa", currentMouthOpenness * intensity);
  if (expr.expressionMap["oh"]) expr.setValue("oh", currentMouthOpenness * 0.35 * Math.abs(Math.sin(idleTime * 12)));
  if (expr.expressionMap["ih"]) expr.setValue("ih", currentMouthOpenness * 0.25 * Math.abs(Math.cos(idleTime * 14)));
  
  if (expr.expressionMap["happy"]) {
    expr.setValue("happy", CONFIG.talkingSmileAmount * currentMouthOpenness);
  }
}

// ============================================
// TALKING CONTROL
// ============================================
export function avatarStartTalking() {
  isTalking = true;
  currentTalkingGesture = -1;
  talkingGestureTimer = 0;
  console.log("[3D] 🗣️ Talking");
  animateTalking();
}

export function avatarStopTalking() {
  isTalking = false;
  targetMouthOpenness = 0;
  currentTalkingGesture = -1;
  
  if (currentVRM?.expressionManager) {
    const expr = currentVRM.expressionManager;
    ["aa", "oh", "ih", "ou", "ee", "happy"].forEach(name => {
      if (expr.expressionMap[name]) expr.setValue(name, 0);
    });
  }
  
  setTimeout(() => triggerNod(), 200);
  console.log("[3D] 🤐 Done");
}

function animateTalking() {
  if (!isTalking) { targetMouthOpenness = 0; return; }

  const time = Date.now() * 0.001;
  const variation = 
    Math.sin(time * 10) * 0.22 + 
    Math.sin(time * 15) * 0.18 +
    Math.sin(time * 24) * 0.12 +
    Math.random() * 0.12;
  
  targetMouthOpenness = Math.max(0.12, Math.min(0.9, 0.4 + variation));
  requestAnimationFrame(animateTalking);
}

// ============================================
// SET EXPRESSION
// ============================================
export function setExpression(name, value = 1.0, duration = 0) {
  if (!currentVRM?.expressionManager) return;
  
  const expr = currentVRM.expressionManager;
  if (expr.expressionMap[name]) {
    expr.setValue(name, value);
    
    if (duration > 0) {
      setTimeout(() => {
        if (currentVRM?.expressionManager?.expressionMap[name]) {
          currentVRM.expressionManager.setValue(name, 0);
        }
      }, duration);
    }
  }
}

// ============================================
// MAIN ANIMATION LOOP
// ============================================
function animate() {
  rafId = requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (controls) controls.update();

  if (currentVRM && avatarReady) {
    updateIdleAnimation(delta);
    updateBlinking(delta);
    updateWaveAnimation(delta);
    updateNodAnimation(delta);
    
    if (isTalking) updateLipSync();

    currentVRM.update(delta);
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// ============================================
// RESIZE
// ============================================
function onResize() {
  if (!container || !camera || !renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// ============================================
// COLOR THEMES
// ============================================
export function setSkyColors(top, mid, bottom) {
  if (fallbackSky?.material?.uniforms) {
    if (top) fallbackSky.material.uniforms.topColor.value.setHex(top);
    if (mid) fallbackSky.material.uniforms.midColor.value.setHex(mid);
    if (bottom) fallbackSky.material.uniforms.bottomColor.value.setHex(bottom);
  }
}

export function setFloorColors(center, edge) {
  if (fallbackGround?.material?.uniforms) {
    if (center) fallbackGround.material.uniforms.centerColor.value.setHex(center);
    if (edge) fallbackGround.material.uniforms.edgeColor.value.setHex(edge);
  }
}

export function setColorTheme(theme) {
  const themes = {
    lavender: { skyTop: 0xB8A8D4, skyMid: 0xD4C4E8, skyBottom: 0xF0E8F8, floorCenter: 0xF5F0FA, floorEdge: 0xD8CFE5 },
    sunset: { skyTop: 0x5A4F7B, skyMid: 0xD97B94, skyBottom: 0xFFE4E9, floorCenter: 0xFFF0F5, floorEdge: 0xF0D8E0 },
    ocean: { skyTop: 0x2E4A6F, skyMid: 0x7BAAD4, skyBottom: 0xE4F0F8, floorCenter: 0xF0F8FF, floorEdge: 0xD8E8F0 },
    mint: { skyTop: 0x5A8C7F, skyMid: 0x9FCCC0, skyBottom: 0xE8F8F0, floorCenter: 0xF0FFF8, floorEdge: 0xD8E8E0 },
    pink: { skyTop: 0xC77EA9, skyMid: 0xEBB8D4, skyBottom: 0xFFF0F8, floorCenter: 0xFFF8FC, floorEdge: 0xF0D8E8 }
  };
  const t = themes[theme];
  if (t) { setSkyColors(t.skyTop, t.skyMid, t.skyBottom); setFloorColors(t.floorCenter, t.floorEdge); }
}

// ============================================
// CLEANUP
// ============================================
export function dispose3D() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (currentVRM) { scene.remove(currentVRM.scene); VRMUtils.deepDispose(currentVRM.scene); currentVRM = null; }
  if (currentRoom) { scene.remove(currentRoom); currentRoom = null; }
  if (controls) { controls.dispose(); controls = null; }
  if (renderer) { renderer.dispose(); if (renderer.domElement) renderer.domElement.remove(); renderer = null; }
  window.removeEventListener("resize", onResize);
  avatarReady = hasRoomLoaded = false;
}

// ============================================
// EXPORTS
// ============================================
export function isAvatarReady() { return avatarReady; }
export function getVRM() { return currentVRM; }
export function getScene() { return scene; }
export function hasRoom() { return hasRoomLoaded; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getControls() { return controls; }
export function getConfig() { return CONFIG; }