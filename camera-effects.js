import * as THREE from 'three';

export class CameraEffects {

  constructor(perspCamera, renderer) {
    this._camera    = perspCamera;
    this._renderer  = renderer;
    this._elapsed   = 0;
    this._shakeOffsetPos = new THREE.Vector3();
    this._shakeOffsetRotX = 0;
    this._shakeOffsetRotY = 0;
    this._shakeOffsetRotZ = 0;

    this._hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this._hudCam.position.z = 5;
    this._hudScene = new THREE.Scene();

    this._vigState   = { active: false, timer: 0 };
    this._shakeState = { active: false, timer: 0 };
    this._shakeConfig = {
      duration: 0.45,
      decayWindow: 0.4,
      amplitude: 0.018,
      randomWeight: 1.0,
      waveWeight: 0.55,
      waveFreqX: 28,
      waveFreqY: 22.5,
      waveFreqZ: 18,
      posX: 4.2,
      posY: 2.8,
      rotX: 0.35,
      rotY: 0,
      rotZ: 0.5
    };

    this._currentShakeConfig = this._shakeConfig;

    this._buildVignette();
    this._buildSplats();
  }

  triggerVignette() {
    this._vigState.active = true;
    this._vigState.timer  = 0;
  }

  triggerShake(options = {}) {
    if (options && typeof options === 'object' && Object.keys(options).length > 0) {
      const merged = { ...this._shakeConfig };
      Object.keys(merged).forEach((key) => {
        if (options[key] !== undefined) {
          const value = Number(options[key]);
          if (Number.isFinite(value)) merged[key] = value;
        }
      });
      this._currentShakeConfig = merged;
    } else {
      this._currentShakeConfig = this._shakeConfig;
    }
    this._shakeState.active = true;
    this._shakeState.timer  = 0;
  }

  setShakeConfig(options = {}) {
    if (!options || typeof options !== 'object') return;
    Object.keys(this._shakeConfig).forEach((key) => {
      if (options[key] === undefined) return;
      const value = Number(options[key]);
      if (Number.isFinite(value)) {
        this._shakeConfig[key] = value;
      }
    });
  }

  triggerBloodSplat() {
    const aspect = window.innerWidth / window.innerHeight;

    const anchors = [
      { ex: -1, ey:  1 },
      { ex:  1, ey:  1 },
      { ex: -1, ey: -1 },
      { ex:  1, ey: -1 },
      { ex:  0, ey:  1 },
      { ex:  0, ey: -1 },
      { ex: -1, ey:  0 },
      { ex:  1, ey:  0 },
    ];

    const texOrder = [...this._splatTextures].sort(() => Math.random() - 0.5);
    const sharedLife = 2.5 + Math.random() * 1.0;

    for (const slot of this._splats) slot.life = 0;

    for (let i = 0; i < 8; i++) {
      const slot   = this._splats[i];
      const anchor = anchors[i];

      slot.mat.map = texOrder[i];
      slot.mat.needsUpdate = true;

      const baseH = 0.75 + Math.random() * 0.25;
      const baseW = baseH / aspect;

      const jitterX = anchor.ex === 0 ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.15;
      const jitterY = anchor.ey === 0 ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.15;

      const cx = anchor.ex === 0
        ? jitterX
        : anchor.ex * (1 + baseW * 0.5 - baseW * 0.40) + jitterX;
      const cy = anchor.ey === 0
        ? jitterY
        : anchor.ey * (1 + baseH * 0.5 - baseH * 0.40) + jitterY;

      slot.mesh.position.set(cx, cy, 0);
      slot.mesh.scale.set(baseW, baseH, 1);
      slot.mesh.rotation.z = (Math.random() - 0.5) * 0.3;
      if (Math.random() > 0.5) slot.mesh.scale.x *= -1;
      if (Math.random() > 0.5) slot.mesh.scale.y *= -1;

      slot.maxLife = sharedLife;
      slot.life    = sharedLife;
      slot.mat.opacity  = 0;
      slot.mesh.visible = true;
    }
  }

  update(delta) {
    const dt = Math.min(delta, .05);

    this._elapsed += dt;

    if (this._vigState.active) {
      this._vigState.timer += dt;
      if (this._vigState.timer > 2.0) this._vigState.active = false;
    }
    this._vigUni.uIntensity.value = this._vigIntensity();
    this._vigUni.uTime.value      = this._elapsed;

    if (this._shakeState.active) {
      this._shakeState.timer += dt;
      if (this._shakeState.timer > this._currentShakeConfig.duration) this._shakeState.active = false;
    }
    const decayWindow = Math.max(0.001, this._currentShakeConfig.decayWindow);
    const shakeDecay = this._shakeState.active
      ? Math.max(0, 1.0 - this._shakeState.timer / decayWindow) * this._currentShakeConfig.amplitude
      : 0;
    this._applyShake(shakeDecay);

    this._updateSplats(dt);

    const prevAutoClear = this._renderer.autoClear;
    this._renderer.autoClear = false;
    this._renderer.clearDepth();
    this._renderer.render(this._hudScene, this._hudCam);
    this._renderer.autoClear = prevAutoClear;
  }

  applyShakeToCamera(camera = this._camera) {
    if (!camera) return;
    camera.position.add(this._shakeOffsetPos);
    camera.rotation.x += this._shakeOffsetRotX;
    camera.rotation.y += this._shakeOffsetRotY;
    camera.rotation.z += this._shakeOffsetRotZ;
  }

  _buildVignette() {
    this._vigUni = {
      uIntensity: { value: 0.0 },
      uTime:      { value: 0.0 },
      uAspect:    { value: window.innerWidth / window.innerHeight }
    };
    this._vigMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this._vigUni,
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uIntensity;
          uniform float uTime;
          uniform float uAspect;

          float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
          float noise(vec2 p){
            vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                       mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
          }
          float fbm(vec2 p){
            float v=0.0,a=0.5;
            for(int i=0;i<4;i++){v+=a*noise(p);p*=2.1;a*=0.5;}
            return v;
          }
          void main(){
            vec2 uv   = vUv - 0.5;
            vec2 absUv = abs(uv) * 2.0;
            absUv.x *= uAspect;
            float boxD = pow(pow(absUv.x,4.0)+pow(absUv.y,4.0),0.25);
            float warp = fbm(vec2(uv.x*3.0+uTime*0.12,uv.y*3.0+uTime*0.09))*0.22;
            float distW = boxD - warp*0.55;
            float n1 = fbm(vec2(uv.x*2.5+uTime*0.25,uv.y*2.5+uTime*0.15))*0.16;
            float n2 = noise(vec2(uv.x*4.0-uTime*0.18,uv.y*4.0+uTime*0.08))*0.05;
            float edge = clamp(smoothstep(0.60+n1-n2,1.05+n1,distW),0.0,1.0);
            float cNoise = fbm(uv*5.0+uTime*0.08);
            vec3 color = mix(vec3(0.88,0.015,0.015),vec3(0.22,0.0,0.0),edge*0.65+cNoise*0.25);
            float streak = noise(vec2(uv.x*8.0+uTime*0.3,uv.y*7.0))*0.08*edge;
            color = mix(color,vec3(0.5,0.0,0.0),streak);
            float alpha = clamp(edge*uIntensity+streak*uIntensity*0.5,0.0,0.96);
            if(alpha<0.005) discard;
            gl_FragColor = vec4(color,alpha);
          }
        `,
        transparent:true, depthTest:false, depthWrite:false,
        blending:THREE.NormalBlending, side:THREE.DoubleSide
      })
    );
    this._hudScene.add(this._vigMesh);
    this._onResize = () => {
      this._vigUni.uAspect.value = window.innerWidth / window.innerHeight;
    };
    window.addEventListener('resize', this._onResize);
  }

  _vigIntensity() {
    if (!this._vigState.active) return 0;
    const t = this._vigState.timer;
    return Math.min(1.0, t / 0.18) * Math.max(0, 1.0 - t / 1.4) * 0.82;
  }

  _buildSplats() {
    const urls = [
      'https://static.seeles.ai/games-sdk/blood.png',
      'https://static.seeles.ai/games-sdk/blood1.png',
      'https://static.seeles.ai/games-sdk/blood2.png',
      'https://static.seeles.ai/games-sdk/blood3.png',
      'https://static.seeles.ai/games-sdk/blood4.png',
      'https://static.seeles.ai/games-sdk/blood5.png',
      'https://static.seeles.ai/games-sdk/blood6.png',
      'https://static.seeles.ai/games-sdk/blood7.png',
    ];
    const loader = new THREE.TextureLoader();
    this._splatTextures = urls.map(url => loader.load(url));
    this._splats = [];
    for (let i = 0; i < 8; i++) {
      const mat  = new THREE.MeshBasicMaterial({ transparent:true, depthTest:false, depthWrite:false, blending:THREE.NormalBlending, opacity:0 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat);
      mesh.visible = false;
      this._hudScene.add(mesh);
      this._splats.push({ mesh, mat, life:0, maxLife:0 });
    }
  }

  _updateSplats(dt) {
    for (const slot of this._splats) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mat.opacity = 0; slot.mesh.visible = false; slot.life = 0;
      } else {
        const lr     = slot.life / slot.maxLife;
        const fadeIn = Math.min(1.0, (slot.maxLife - slot.life) / (slot.maxLife * 0.15));
        slot.mat.opacity = Math.min(fadeIn, lr < 0.3 ? lr / 0.3 : 1.0) * 0.92;
      }
    }
  }

  destroy() {
    for (const slot of this._splats) {
      slot.mesh.geometry.dispose();
      slot.mat.dispose();
    }
    this._splats = [];
    this._splatTextures.forEach(t => t.dispose());
    this._splatTextures = [];
    this._vigMesh.geometry.dispose();
    this._vigMesh.material.dispose();
    window.removeEventListener('resize', this._onResize);
  }

  _applyShake(shake) {
    const e = this._elapsed;
    const cfg = this._currentShakeConfig;
    if (shake > 0) {
      const jx = (Math.random() - 0.5) * shake * 2 * cfg.randomWeight + Math.sin(e * cfg.waveFreqX) * shake * cfg.waveWeight;
      const jy = (Math.random() - 0.5) * shake * cfg.randomWeight + Math.sin(e * cfg.waveFreqY) * shake * cfg.waveWeight * 0.7;
      const jz = (Math.random() - 0.5) * shake * 3.2 * cfg.randomWeight + Math.sin(e * cfg.waveFreqZ) * shake * cfg.waveWeight * 1.2;

      this._shakeOffsetPos.set(jx * cfg.posX, jy * cfg.posY, 0);
      this._shakeOffsetRotX = jy * cfg.rotX;
      this._shakeOffsetRotY = jx * cfg.rotY;
      this._shakeOffsetRotZ = jz * cfg.rotZ;
    } else {
      this._shakeOffsetPos.set(0, 0, 0);
      this._shakeOffsetRotX = 0;
      this._shakeOffsetRotY = 0;
      this._shakeOffsetRotZ = 0;
    }

    this._hudCam.position.x = 0;
    this._hudCam.position.y = 0;
    this._hudCam.rotation.z = 0;
  }
}