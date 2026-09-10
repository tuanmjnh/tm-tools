export interface StealthOptions {
  maskWebdriver?: boolean
  fakeChrome?: boolean
  canvasNoise?: boolean
  webglNoise?: boolean
  canvasMode?: string
  webglMode?: string
  webglVendor?: string
  webglRenderer?: string
  hardwareConcurrency?: number
  deviceMemory?: number
  languages?: string[] | string
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StealthHelper {
  public static generateStealthScript(options: StealthOptions = {}): string {
    const {
      maskWebdriver = true,
      fakeChrome = true,
      canvasNoise = false,
      webglNoise = false,
      canvasMode,
      webglMode,
      webglVendor = 'Google Inc. (NVIDIA)',
      webglRenderer = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
      hardwareConcurrency = 8,
      deviceMemory = 8,
      languages = ['vi-VN', 'vi', 'en-US', 'en']
    } = options

    const shouldInjectCanvas = canvasNoise || canvasMode === 'noise'
    const shouldInjectWebgl = webglNoise || webglMode === 'noise' || Boolean(webglVendor || webglRenderer)

    const parts: string[] = [
      '// TM Tools Stealth & Anti-Fingerprint Initializer',
      '(function() {'
    ]

    // 1. Xóa navigator.webdriver
    if (maskWebdriver) {
      parts.push(`
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });
      `)
    }

    // 2. Giả lập window.chrome nếu là chromium engine
    if (fakeChrome) {
      parts.push(`
        if (!window.chrome) {
          window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {},
          };
        }
      `)
    }

    // 3. Giả lập cấu hình phần cứng chân thực
    parts.push(`
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => ${hardwareConcurrency},
        configurable: true,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => ${deviceMemory},
        configurable: true,
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ${JSON.stringify(languages)},
        configurable: true,
      });
    `)

    // 4. Giả lập Canvas Noise (chống tracking canvas fingerprint)
    if (shouldInjectCanvas) {
      parts.push(`
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
          const ctx = this.getContext('2d');
          if (ctx && this.width > 0 && this.height > 0) {
            try {
              const imgData = ctx.getImageData(0, 0, 1, 1);
              imgData.data[0] = (imgData.data[0] + 1) % 256;
              ctx.putImageData(imgData, 0, 0);
            } catch (e) {}
          }
          return originalToDataURL.apply(this, arguments);
        };
      `)
    }

    // 5. Giả lập WebGL Noise / Spoofing
    if (shouldInjectWebgl) {
      parts.push(`
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // UNMASKED_VENDOR_WEBGL
          if (parameter === 37445) return ${JSON.stringify(webglVendor)};
          // UNMASKED_RENDERER_WEBGL
          if (parameter === 37446) return ${JSON.stringify(webglRenderer)};
          return getParameter.apply(this, arguments);
        };
      `)
    }

    parts.push('})();')
    return parts.join('\n')
  }
}
