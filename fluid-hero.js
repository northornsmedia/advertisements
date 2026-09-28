/**
 * WIPA ADS Fluid Hero Simulation & Masking Shader
 * Real-time Navier-Stokes fluid displacement with 3D liquid chrome WIPA ADS reveal
 */

(function () {
  'use strict';

  // --- Fluid Simulation Shaders ---
  const quadVertShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const planeVertShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const splatFragShader = `
    precision highp float;
    uniform sampler2D uTarget;
    uniform float uAspectRatio;
    uniform vec2 uPoint;
    uniform vec3 uColor;
    uniform float uRadius;
    varying vec2 vUv;

    void main() {
      vec2 p = vUv - uPoint;
      p.x *= uAspectRatio;
      vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }
  `;

  const curlFragShader = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    varying vec2 vUv;

    void main() {
      float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
      float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
      float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
      float vorticity = R - L - T + B;
      gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `;

  const vorticityFragShader = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform vec2 uTexelSize;
    uniform float uCurlStrength;
    uniform float uDt;
    varying vec2 vUv;

    void main() {
      float L = texture2D(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
      float C = texture2D(uCurl, vUv).x;

      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      float len = length(force) + 0.0001;
      force = force / len * uCurlStrength * C;

      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity += force * uDt;

      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `;

  const divergenceFragShader = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    varying vec2 vUv;

    void main() {
      float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
      float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;

      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `;

  const pressureFragShader = `
    precision highp float;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform vec2 uTexelSize;
    varying vec2 vUv;

    void main() {
      float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
      float C = texture2D(uDivergence, vUv).x;

      float pressure = (L + R + B + T - C) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `;

  const gradientSubFragShader = `
    precision highp float;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    varying vec2 vUv;

    void main() {
      float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
      float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
      float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;

      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity -= vec2(R - L, T - B) * 0.5;
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `;

  const advectionFragShader = `
    precision highp float;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 uTexelSize;
    uniform float uDt;
    uniform float uDissipation;
    varying vec2 vUv;

    vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5;
      vec2 iuv = floor(st);
      vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main() {
      vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexelSize;
      vec4 result = uDissipation * bilerp(uSource, coord, uTexelSize);
      gl_FragColor = result;
    }
  `;

  const maskFragShader = `
    precision highp float;
    uniform sampler2D uBaseTexture;
    uniform sampler2D uRevealTexture;
    uniform sampler2D uDye;
    uniform sampler2D uVelocity;

    uniform float uTime;
    uniform float uRevealSize;
    uniform float uEdgeSoftness;
    uniform float uEdgeWidth;

    uniform float uBaseImageAspect;
    uniform float uRevealImageAspect;
    uniform float uPlaneAspect;

    varying vec2 vUv;

    vec2 coverUv(vec2 uv, float imageAspect, float planeAspect) {
      vec2 ratio = vec2(
        min(planeAspect / imageAspect, 1.0),
        min(imageAspect / planeAspect, 1.0)
      );
      return vec2(
        uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
        uv.y * ratio.y + (1.0 - ratio.y) * 0.5
      );
    }

    void main() {
      float dye = texture2D(uDye, vUv).r;
      vec2 vel = texture2D(uVelocity, vUv).xy;

      // Base typography sampling
      vec2 baseUv = coverUv(vUv, uBaseImageAspect, uPlaneAspect);
      baseUv = clamp(baseUv, 0.001, 0.999);
      vec4 baseColor = texture2D(uBaseTexture, baseUv);

      // Reveal 3D liquid chrome WIPA ADS texture with fluid displacement
      vec2 revealUv = coverUv(vUv, uRevealImageAspect, uPlaneAspect);
      
      // Dynamic fluid velocity displacement
      vec2 distortedRevealUv = revealUv - vel * 0.05;
      
      // Subtle liquid surface shimmer
      distortedRevealUv += vec2(
        sin(vUv.y * 24.0 + uTime * 2.2),
        cos(vUv.x * 24.0 + uTime * 2.2)
      ) * 0.002;
      distortedRevealUv = clamp(distortedRevealUv, 0.001, 0.999);

      vec4 revealColor = texture2D(uRevealTexture, distortedRevealUv);

      // Specular highlight boost on moving liquid
      float velMag = length(vel);
      revealColor.rgb += vec3(0.12, 0.08, 0.16) * smoothstep(0.015, 0.15, velMag);

      // Threshold mask
      float raw = dye * uRevealSize;
      float mask = smoothstep(uEdgeSoftness, uEdgeSoftness + uEdgeWidth, raw);
      mask = clamp(mask, 0.0, 1.0);

      gl_FragColor = mix(baseColor, revealColor, mask);
    }
  `;

  const SETTINGS = {
    simResolution: 256,
    dyeResolution: 512,
    velocityDissipation: 0.965,
    dyeDissipation: 0.988,
    pressureIterations: 20,
    curlStrength: 0,
    splatRadius: 0.00136,
    splatForce: 6400,
    revealSize: 4.0,
    edgeSoftness: 0.46,
    edgeWidth: 0.015
  };

  class WipaFluidHero {
    constructor(container, options = {}) {
      this.container = container;
      this.settings = Object.assign({}, SETTINGS, options);

      this.mouse = { x: 0.5, y: 0.5 };
      this.prevMouse = { x: 0.5, y: 0.5 };
      this.mouseHasMoved = false;
      this.hasUserInteracted = false;
      this.time = 0;

      this.size = { width: 1, height: 1 };
      this.baseAspect = 1;
      this.revealAspect = 16 / 9;

      this.init();
    }

    async init() {
      this._buildCanvas();
      this._buildRenderer();
      this._buildScenes();
      this._initFluid();
      await this._loadLayers();
      this._buildMaskMaterial();
      this._buildMeshes();
      this._bindEvents();
      this._resize();

      // Trigger ambient intro splashes across WIPA ADS
      this._triggerIntroSplashes();

      this._animate = this._animate.bind(this);
      this._rafId = requestAnimationFrame(this._animate);
    }

    _buildCanvas() {
      const canvas = document.createElement('canvas');
      canvas.className = 'mask-reveal-canvas';
      this.container.appendChild(canvas);
      this.canvas = canvas;
    }

    _buildRenderer() {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
        premultipliedAlpha: false
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.autoClear = false;

      const gl = this.renderer.getContext();
      const hasHalfFloat = gl.getExtension('OES_texture_half_float') || gl.getExtension('EXT_color_buffer_half_float');
      const hasFloat = gl.getExtension('OES_texture_float') || gl.getExtension('EXT_color_buffer_float');
      this.rtType = hasHalfFloat ? THREE.HalfFloatType : (hasFloat ? THREE.FloatType : THREE.UnsignedByteType);
    }

    _buildScenes() {
      this.quadScene = new THREE.Scene();
      this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      this.camera.position.set(0, 0, 5);
    }

    _createRT(w, h, filter = THREE.LinearFilter) {
      return new THREE.WebGLRenderTarget(w, h, {
        minFilter: filter,
        magFilter: filter,
        format: THREE.RGBAFormat,
        type: this.rtType,
        depthBuffer: false,
        stencilBuffer: false
      });
    }

    _createDoubleFBO(w, h, filter = THREE.LinearFilter) {
      return {
        read: this._createRT(w, h, filter),
        write: this._createRT(w, h, filter),
        swap() {
          const tmp = this.read;
          this.read = this.write;
          this.write = tmp;
        }
      };
    }

    _initFluid() {
      const sim = this.settings.simResolution;
      const dye = this.settings.dyeResolution;

      this.velocity = this._createDoubleFBO(sim, sim, THREE.LinearFilter);
      this.pressure = this._createDoubleFBO(sim, sim, THREE.NearestFilter);
      this.dye = this._createDoubleFBO(dye, dye, THREE.LinearFilter);
      this.curlRT = this._createRT(sim, sim, THREE.NearestFilter);
      this.divergenceRT = this._createRT(sim, sim, THREE.NearestFilter);

      this.simTexelSize = new THREE.Vector2(1 / sim, 1 / sim);
      this.dyeTexelSize = new THREE.Vector2(1 / dye, 1 / dye);

      this.quadGeo = new THREE.PlaneGeometry(2, 2);

      this.curlMat = this._makePassMat(curlFragShader, {
        uVelocity: { value: null },
        uTexelSize: { value: this.simTexelSize }
      });

      this.vorticityMat = this._makePassMat(vorticityFragShader, {
        uVelocity: { value: null },
        uCurl: { value: null },
        uTexelSize: { value: this.simTexelSize },
        uCurlStrength: { value: this.settings.curlStrength },
        uDt: { value: 0.016 }
      });

      this.advectionMat = this._makePassMat(advectionFragShader, {
        uVelocity: { value: null },
        uSource: { value: null },
        uTexelSize: { value: this.simTexelSize },
        uDt: { value: 1.0 },
        uDissipation: { value: this.settings.velocityDissipation }
      });

      this.splatMat = this._makePassMat(splatFragShader, {
        uTarget: { value: null },
        uAspectRatio: { value: 1.0 },
        uPoint: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Vector3() },
        uRadius: { value: this.settings.splatRadius }
      });

      this.divergenceMat = this._makePassMat(divergenceFragShader, {
        uVelocity: { value: null },
        uTexelSize: { value: this.simTexelSize }
      });

      this.pressureMat = this._makePassMat(pressureFragShader, {
        uPressure: { value: null },
        uDivergence: { value: null },
        uTexelSize: { value: this.simTexelSize }
      });

      this.gradientSubMat = this._makePassMat(gradientSubFragShader, {
        uPressure: { value: null },
        uVelocity: { value: null },
        uTexelSize: { value: this.simTexelSize }
      });

      this.quadMesh = new THREE.Mesh(this.quadGeo, this.curlMat);
      this.quadScene.add(this.quadMesh);
    }

    _makePassMat(fragmentShader, uniforms) {
      return new THREE.ShaderMaterial({
        vertexShader: quadVertShader,
        fragmentShader: fragmentShader,
        uniforms: uniforms,
        depthTest: false,
        depthWrite: false
      });
    }

    _renderPass(material, target) {
      this.quadMesh.material = material;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    async _loadLayers() {
      // 1. Bake Base Typography ("WIPA ADS")
      await this._bakeBaseTexture();

      // Hide the HTML hero title element once WebGL takes over
      const titleEl = this.container.querySelector('.hero-title');
      if (titleEl) {
        titleEl.style.visibility = 'hidden';
      }

      // 2. Setup 3D Chrome WIPA ADS Reveal Texture
      const textureLoader = new THREE.TextureLoader();
      await new Promise((resolve) => {
        textureLoader.load(
          'assets/wipa-ads-chrome.jpg',
          (tex) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            this.revealTexture = tex;
            if (tex.image && tex.image.width && tex.image.height) {
              this.revealAspect = tex.image.width / tex.image.height;
              if (this.maskMaterial) {
                this.maskMaterial.uniforms.uRevealImageAspect.value = this.revealAspect;
              }
            }
            resolve();
          },
          undefined,
          () => {
            console.warn('Could not load wipa-ads-chrome.jpg, using video fallback');
            resolve();
          }
        );
      });
    }

    async _bakeBaseTexture() {
      const containerRect = this.container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const w = Math.max(1, Math.round(containerRect.width * dpr));
      const h = Math.max(1, Math.round(containerRect.height * dpr));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      // Pure crisp white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Ensure web fonts are completely loaded
      if (document.fonts) {
        await document.fonts.ready;
      }

      // Draw "WIPA ADS" in solid black ultra-heavy grotesque
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Compute font size to align with 3D chrome letters
      let targetFontSize = Math.min(w * 0.165, h * 0.42);
      ctx.font = `900 ${targetFontSize}px 'Archivo Black', 'Inter', -apple-system, BlinkMacSystemFont, 'Arial Black', sans-serif`;

      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '-0.035em';
      }

      // Precise measure & fit check
      let measured = ctx.measureText('WIPA ADS').width;
      const maxAllowed = w * 0.86;
      if (measured > maxAllowed) {
        targetFontSize *= (maxAllowed / measured);
        ctx.font = `900 ${targetFontSize}px 'Archivo Black', 'Inter', -apple-system, BlinkMacSystemFont, 'Arial Black', sans-serif`;
      }

      // Draw slightly raised to align with 3D balloon centers
      ctx.fillText('WIPA ADS', w / 2, h / 2 - h * 0.01);

      if (this.baseTexture) {
        this.baseTexture.dispose();
      }
      this.baseTexture = new THREE.CanvasTexture(canvas);
      this.baseTexture.minFilter = THREE.LinearFilter;
      this.baseTexture.magFilter = THREE.LinearFilter;
      this.baseTexture.needsUpdate = true;
      this.baseAspect = w / h;
    }

    _buildMaskMaterial() {
      this.maskMaterial = new THREE.ShaderMaterial({
        vertexShader: planeVertShader,
        fragmentShader: maskFragShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBaseTexture: { value: this.baseTexture },
          uRevealTexture: { value: this.revealTexture },
          uDye: { value: null },
          uVelocity: { value: null },
          uTime: { value: 0.0 },
          uRevealSize: { value: this.settings.revealSize },
          uEdgeSoftness: { value: this.settings.edgeSoftness },
          uEdgeWidth: { value: this.settings.edgeWidth },
          uBaseImageAspect: { value: this.baseAspect },
          uRevealImageAspect: { value: this.revealAspect },
          uPlaneAspect: { value: 1.0 }
        }
      });
    }

    _buildMeshes() {
      this.planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
      this.planeMesh = new THREE.Mesh(this.planeGeo, this.maskMaterial);
      this.scene.add(this.planeMesh);
    }

    _bindEvents() {
      this._onMouseMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - rect.left) / rect.width;
        this.mouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
        this.mouseHasMoved = true;
        this.hasUserInteracted = true;
      };

      this._onTouchMove = (e) => {
        if (!e.touches.length) return;
        const t = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = (t.clientX - rect.left) / rect.width;
        this.mouse.y = 1.0 - (t.clientY - rect.top) / rect.height;
        this.mouseHasMoved = true;
        this.hasUserInteracted = true;
      };

      this._onResize = () => this._resize();

      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
      window.addEventListener('touchmove', this._onTouchMove, { passive: true });
      window.addEventListener('resize', this._onResize);
    }

    _resize() {
      const rect = this.container.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      this.size = { width: w, height: h };

      this.renderer.setSize(w, h, false);

      const aspect = w / h;
      this.camera.aspect = aspect;
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();

      const fovRad = (this.camera.fov * Math.PI) / 180;
      const planeH = 2 * Math.tan(fovRad / 2) * this.camera.position.z;
      const planeW = planeH * aspect;

      if (this.planeMesh) {
        this.planeMesh.scale.set(planeW, planeH, 1);
      }
      if (this.maskMaterial) {
        this.maskMaterial.uniforms.uPlaneAspect.value = aspect;
      }

      // Re-bake text texture on resize
      clearTimeout(this._rebakeTimeout);
      this._rebakeTimeout = setTimeout(() => {
        this._bakeBaseTexture().then(() => {
          if (this.maskMaterial) {
            this.maskMaterial.uniforms.uBaseTexture.value = this.baseTexture;
            this.maskMaterial.uniforms.uBaseImageAspect.value = this.baseAspect;
          }
        });
      }, 150);
    }

    _splat(x, y, dx, dy, dyeMultiplier = 1.0) {
      const aspect = this.size.width / this.size.height;
      const force = this.settings.splatForce;

      // 1. Splat Velocity
      this.splatMat.uniforms.uTarget.value = this.velocity.read.texture;
      this.splatMat.uniforms.uAspectRatio.value = aspect;
      this.splatMat.uniforms.uPoint.value.set(x, y);
      this.splatMat.uniforms.uColor.value.set(dx * force, dy * force, 0);
      this.splatMat.uniforms.uRadius.value = this.settings.splatRadius;
      this._renderPass(this.splatMat, this.velocity.write);
      this.velocity.swap();

      // 2. Splat Dye (Reveal mask)
      this.splatMat.uniforms.uTarget.value = this.dye.read.texture;
      this.splatMat.uniforms.uColor.value.set(dyeMultiplier, dyeMultiplier, dyeMultiplier);
      this._renderPass(this.splatMat, this.dye.write);
      this.dye.swap();
    }

    _triggerIntroSplashes() {
      // Natural organic wave splash across the center of WIPA ADS
      const points = [
        { x: 0.22, y: 0.50, dx: 0.003, dy: -0.002, delay: 100 },
        { x: 0.35, y: 0.52, dx: 0.004, dy: 0.003, delay: 250 },
        { x: 0.45, y: 0.48, dx: -0.002, dy: 0.005, delay: 400 },
        { x: 0.58, y: 0.51, dx: 0.005, dy: -0.003, delay: 550 },
        { x: 0.70, y: 0.49, dx: -0.004, dy: 0.004, delay: 700 },
        { x: 0.50, y: 0.50, dx: 0.002, dy: -0.004, delay: 900 }
      ];

      points.forEach(p => {
        setTimeout(() => {
          this._splat(p.x, p.y, p.dx, p.dy, 1.25);
        }, p.delay);
      });
    }

    _step() {
      this.time += 0.016;

      // Handle user mouse movement
      if (this.mouseHasMoved) {
        const dx = this.mouse.x - this.prevMouse.x;
        const dy = this.mouse.y - this.prevMouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.0001) {
          this._splat(this.mouse.x, this.mouse.y, dx, dy, 1.0);
        }

        this.prevMouse.x = this.mouse.x;
        this.prevMouse.y = this.mouse.y;
        this.mouseHasMoved = false;
      }

      // Idle fluid shimmer: subtle organic perturbation when idle
      if (!this.hasUserInteracted) {
        const cx = 0.5 + Math.sin(this.time * 0.9) * 0.20;
        const cy = 0.5 + Math.cos(this.time * 1.1) * 0.07;
        const cdx = Math.cos(this.time * 1.5) * 0.001;
        const cdy = Math.sin(this.time * 1.3) * 0.001;
        this._splat(cx, cy, cdx, cdy, 0.42);
      }

      // 1. Curl
      this.curlMat.uniforms.uVelocity.value = this.velocity.read.texture;
      this._renderPass(this.curlMat, this.curlRT);

      // 2. Vorticity Confinement
      this.vorticityMat.uniforms.uVelocity.value = this.velocity.read.texture;
      this.vorticityMat.uniforms.uCurl.value = this.curlRT.texture;
      this.vorticityMat.uniforms.uCurlStrength.value = this.settings.curlStrength;
      this.vorticityMat.uniforms.uDt.value = 0.016;
      this._renderPass(this.vorticityMat, this.velocity.write);
      this.velocity.swap();

      // 3. Velocity Advection
      this.advectionMat.uniforms.uVelocity.value = this.velocity.read.texture;
      this.advectionMat.uniforms.uSource.value = this.velocity.read.texture;
      this.advectionMat.uniforms.uTexelSize.value = this.simTexelSize;
      this.advectionMat.uniforms.uDissipation.value = this.settings.velocityDissipation;
      this._renderPass(this.advectionMat, this.velocity.write);
      this.velocity.swap();

      // 4. Dye Advection
      this.advectionMat.uniforms.uVelocity.value = this.velocity.read.texture;
      this.advectionMat.uniforms.uSource.value = this.dye.read.texture;
      this.advectionMat.uniforms.uTexelSize.value = this.dyeTexelSize;
      this.advectionMat.uniforms.uDissipation.value = this.settings.dyeDissipation;
      this._renderPass(this.advectionMat, this.dye.write);
      this.dye.swap();

      // 5. Divergence
      this.divergenceMat.uniforms.uVelocity.value = this.velocity.read.texture;
      this._renderPass(this.divergenceMat, this.divergenceRT);

      // 6. Pressure Poisson Solver (Jacobi Iterations)
      this.renderer.setRenderTarget(this.pressure.read);
      this.renderer.clear();
      this.renderer.setRenderTarget(null);

      this.pressureMat.uniforms.uDivergence.value = this.divergenceRT.texture;
      for (let i = 0; i < this.settings.pressureIterations; i++) {
        this.pressureMat.uniforms.uPressure.value = this.pressure.read.texture;
        this._renderPass(this.pressureMat, this.pressure.write);
        this.pressure.swap();
      }

      // 7. Gradient Subtraction
      this.gradientSubMat.uniforms.uPressure.value = this.pressure.read.texture;
      this.gradientSubMat.uniforms.uVelocity.value = this.velocity.read.texture;
      this._renderPass(this.gradientSubMat, this.velocity.write);
      this.velocity.swap();

      // 8. Final Screen Composition Pass
      const uniforms = this.maskMaterial.uniforms;
      uniforms.uDye.value = this.dye.read.texture;
      uniforms.uVelocity.value = this.velocity.read.texture;
      uniforms.uTime.value = this.time;
      uniforms.uRevealSize.value = this.settings.revealSize;
      uniforms.uEdgeSoftness.value = this.settings.edgeSoftness;
      uniforms.uEdgeWidth.value = this.settings.edgeWidth;
      uniforms.uBaseImageAspect.value = this.baseAspect;
      uniforms.uRevealImageAspect.value = this.revealAspect;

      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }

    _animate() {
      this._rafId = requestAnimationFrame(this._animate);
      this._step();
    }
  }

  // Auto-initialize when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.section-w');
    if (container) {
      window.wipaFluid = new WipaFluidHero(container);
    }
  });

})();
