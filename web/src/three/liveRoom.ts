// חדר ההקלטה שרואים מבעד לחלון בחדר הבקרה. נבנה כולו בקוד (בלי קבצי מודל),
// ומקבל מבחוץ רק שלושה דברים: מי הלקוח, האם יש הקלטה, האם רץ שעון עבודה.
import * as THREE from 'three'
import { makeChar, memberColors, idlePose, walkPose, REDUCED, type Char } from './character'

export interface RoomClient { color_a: string; color_b: string; is_group: number | null }
export interface LiveRoom {
  setClient(c: RoomClient | null): void
  setWork(on: boolean, c?: RoomClient | null): void
  setRec(on: boolean): void
  /** סיום סשן: כל הדמויות יוצאות מהדלת, ואז onDone */
  leave(onDone: () => void): void
  dispose(): void
}

interface Spot { p: THREE.Vector3; f?: number; sit?: boolean }
interface Member { ch: Char; i: number; spot: Spot; seated?: boolean; leaving?: boolean; walk: null | { t0: number; dur: number; from: THREE.Vector3; mid: THREE.Vector3; to: THREE.Vector3 } }

export function createLiveRoom(cv: HTMLCanvasElement): LiveRoom {
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true })
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  r.outputColorSpace = THREE.SRGBColorSpace
  // האב־טיפוס כוונן על מודל התאורה הישן של three.js; שומרים עליו כדי שייראה זהה
  ;(r as unknown as { useLegacyLights: boolean }).useLegacyLights = true
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1420)
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, .1, 50); cam.position.set(0, 1.7, 5.6); cam.lookAt(0, 1.05, 0)
  const ANISO = r.capabilities.getMaxAnisotropy()

  // ---------- טקסטורות מצוירות בקוד ----------
  type Ctx = CanvasRenderingContext2D
  const ctex = (w: number, h: number, fn: (x: Ctx, w: number, h: number) => void, rx?: number, ry?: number) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; fn(x, w, h)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO
    if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry || rx) }
    return t
  }
  const rnd = (a: number) => { const x = Math.sin(a * 12.9898) * 43758.5453; return x - Math.floor(x) }
  const noise = (x: Ctx, w: number, h: number, amt: number, seed = 1) => {
    const d = x.getImageData(0, 0, w, h), p = d.data
    for (let i = 0; i < p.length; i += 4) { const n = (rnd(i * .25 + seed) - .5) * amt; p[i] += n; p[i + 1] += n; p[i + 2] += n }
    x.putImageData(d, 0, 0)
  }
  const grain = (x: Ctx, y0: number, w: number, h: number, base: string, seed: number) => {
    x.fillStyle = base; x.fillRect(0, y0, w, h); x.globalAlpha = .16
    for (let k = 0; k < 14; k++) {
      x.strokeStyle = rnd(seed + k) > .5 ? '#3a2210' : '#f3c891'; x.lineWidth = .6 + rnd(seed * 3 + k) * 1.6; x.beginPath()
      const yy = y0 + rnd(seed + k * 7) * h
      for (let xx = 0; xx <= w; xx += 12) { const v = yy + Math.sin(xx * .012 + k + seed) * h * .08 + Math.sin(xx * .05 + k * 2) * 1.2; if (xx) x.lineTo(xx, v); else x.moveTo(xx, v) }
      x.stroke()
    }
    x.globalAlpha = 1
  }
  const floorTex = ctex(1024, 1024, (x, w, h) => {
    const rows = 8, rh = h / rows, pw = w / 2, cols = ['#9a6640', '#91603c', '#a5714a', '#8a5a36', '#9e6a43']
    for (let r0 = 0; r0 < rows; r0++) {
      const off = Math.floor(rnd(r0 + 1) * pw)
      for (let sx = -off, k = 0; sx < w; sx += pw, k++) {
        const col = cols[Math.floor(rnd(r0 * 7 + k + 2) * cols.length)]
        x.save(); x.beginPath(); x.rect(sx, r0 * rh, pw, rh); x.clip(); grain(x, r0 * rh, w, rh, col, r0 * 9 + k); x.restore()
        x.fillStyle = 'rgba(40,22,10,.55)'; if (sx > 0) x.fillRect(sx, r0 * rh, 2, rh)
      }
      x.fillStyle = 'rgba(40,22,10,.6)'; x.fillRect(0, r0 * rh, w, 2)
    }
    noise(x, w, h, 14, 3)
  }, 3, 3)
  const slatTex = ctex(256, 1024, (x, w, h) => { x.save(); x.translate(w, 0); x.rotate(Math.PI / 2); grain(x, 0, h, w, '#c98b52', 5); x.restore(); noise(x, w, h, 10, 7) })
  const fabricTex = ctex(256, 256, (x, w, h) => { x.fillStyle = '#5a4a62'; x.fillRect(0, 0, w, h); noise(x, w, h, 34, 11); x.globalAlpha = .08; x.fillStyle = '#000'; for (let i = 0; i < w; i += 3) x.fillRect(i, 0, 1, h); x.globalAlpha = 1 }, 2, 2)
  const wallTex = ctex(512, 512, (x, w, h) => { x.fillStyle = '#4d3f4c'; x.fillRect(0, 0, w, h); noise(x, w, h, 10, 13) }, 3, 2)
  const rugTex = ctex(1024, 1024, (x, w, h) => {
    const cx = w / 2, cy = h / 2
    for (let rr = w / 2; rr > 4; rr -= 7) { x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); const k = Math.floor(rr / 7) % 3; x.fillStyle = ['#8a5a3a', '#7d5034', '#9a6844'][k]; x.fill() }
    x.globalAlpha = .25
    for (let a2 = 0; a2 < 720; a2++) { const ang = a2 / 720 * Math.PI * 2; x.strokeStyle = a2 % 2 ? '#4a2c1a' : '#d6a878'; x.beginPath(); x.moveTo(cx + Math.cos(ang) * 20, cy + Math.sin(ang) * 20); x.lineTo(cx + Math.cos(ang) * w / 2, cy + Math.sin(ang) * h / 2); x.lineWidth = .6; x.stroke() }
    x.globalAlpha = 1; noise(x, w, h, 18, 17)
  })
  const grillTex = ctex(256, 256, (x, w, h) => {
    x.fillStyle = '#4a3b2a'; x.fillRect(0, 0, w, h); x.globalAlpha = .5; x.strokeStyle = '#2a2016'
    for (let i = -h; i < w; i += 5) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i + h, 0); x.lineTo(i, h); x.stroke() }
    x.globalAlpha = 1; noise(x, w, h, 20, 19)
  })
  const potTex = ctex(256, 256, (x, w, h) => {
    x.fillStyle = '#e7dccb'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(120,100,80,.35)'
    for (let i = 0; i < h; i += 6) { x.beginPath(); for (let xx = 0; xx <= w; xx += 8) { const v = i + Math.sin(xx * .15 + i) * 1.5; if (xx) x.lineTo(xx, v); else x.moveTo(xx, v) } x.stroke() }
    noise(x, w, h, 16, 23)
  })

  const M = (c: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o })
  const add = <G extends THREE.BufferGeometry>(g: G, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(g, m); b.position.set(x, y, z); b.receiveShadow = true; b.castShadow = true; scene.add(b); return b
  }
  const B = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z)
  const C = (rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, s = 32) => add(new THREE.CylinderGeometry(rt, rb, h, s), m, x, y, z)
  const RB = (w: number, h: number, d: number, rad: number, m: THREE.Material, x: number, y: number, z: number) => {
    const sh = new THREE.Shape(), W = w / 2 - rad, H = h / 2 - rad
    sh.moveTo(-W, -h / 2); sh.lineTo(W, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -H); sh.lineTo(w / 2, H); sh.quadraticCurveTo(w / 2, h / 2, W, h / 2)
    sh.lineTo(-W, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, H); sh.lineTo(-w / 2, -H); sh.quadraticCurveTo(-w / 2, -h / 2, -W, -h / 2)
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(.001, d - rad * 2), bevelEnabled: true, bevelThickness: rad, bevelSize: rad * .9, bevelSegments: 3, curveSegments: 6 }); g.center()
    g.computeBoundingBox(); const bb = g.boundingBox!, uv = g.attributes.uv, pos = g.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y))
    return add(g, m, x, y, z)
  }

  // ---------- תאורה ----------
  const hemi = new THREE.HemisphereLight(0xffe2c8, 0x3a2440, .55); scene.add(hemi)
  const sunL = new THREE.DirectionalLight(0xffe6cc, .55); sunL.position.set(2.5, 6, 6); sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048)
  const sc2 = sunL.shadow.camera; sc2.left = -5; sc2.right = 5; sc2.top = 5; sc2.bottom = -3; sc2.far = 20; sunL.shadow.radius = 4; sunL.shadow.bias = -.0005; scene.add(sunL)
  const key = new THREE.SpotLight(0xffcf8a, 0, 12, .5, .65, 1); key.position.set(0, 4.2, 2.4); key.target.position.set(0, .9, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key); scene.add(key.target)
  const fill = new THREE.PointLight(0xd8b88c, .25, 10); fill.position.set(-3, 2.5, 1.5); scene.add(fill)
  const warm = new THREE.PointLight(0xffb36b, .6, 6, 1.6); warm.position.set(-3.1, 1.75, -1.9); scene.add(warm)
  const wash = new THREE.SpotLight(0xffc48a, .7, 7, .9, .8, 1.2); wash.position.set(0, 3.9, -1.2); wash.target.position.set(0, 1.6, -3); scene.add(wash); scene.add(wash.target)

  // ---------- החדר ----------
  add(new THREE.PlaneGeometry(9, 7), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .55, bumpMap: floorTex, bumpScale: .002 }), 0, 0, 0).rotation.x = -Math.PI / 2
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: .95 })
  add(new THREE.PlaneGeometry(9, 4), wallM, 0, 2, -3.05)
  add(new THREE.PlaneGeometry(7, 4), wallM, -4.5, 2, .45).rotation.y = Math.PI / 2
  add(new THREE.PlaneGeometry(7, 4), wallM, 4.5, 2, .45).rotation.y = -Math.PI / 2
  add(new THREE.PlaneGeometry(9, 7), M(0x2a1f2e), 0, 4, .45).rotation.x = Math.PI / 2
  const baseM = M(0xc49067, { roughness: .6 })
  B(9, .14, .04, baseM, 0, .07, -3.02); B(.04, .14, 7, baseM, -4.47, .07, .45); B(.04, .14, 7, baseM, 4.47, .07, .45)
  // קיר דיפוזור מעץ
  B(6.9, 2.6, .04, M(0x241a22, { roughness: 1 }), 0, 2.1, -3.0)
  const slatM = new THREE.MeshStandardMaterial({ map: slatTex, roughness: .5, bumpMap: slatTex, bumpScale: .003 })
  for (let k = 0; k < 26; k++) RB(.16, 2.5, .1, .02, slatM, -3.25 + k * .26, 2.1, -2.92)
  // פאנלים אקוסטיים
  const fabM = new THREE.MeshStandardMaterial({ map: fabricTex, roughness: 1, bumpMap: fabricTex, bumpScale: .01 })
  for (const p of [[-4.4, -1.9], [-4.4, -.3], [4.4, -.3], [4.4, 1.3]]) { const pn = RB(1.25, 1.55, .14, .05, fabM, p[0], 2.15, p[1]); pn.rotation.y = p[0] < 0 ? Math.PI / 2 : -Math.PI / 2 }
  add(new THREE.CircleGeometry(1.65, 64), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1, bumpMap: rugTex, bumpScale: .02 }), 0, .012, .35).rotation.x = -Math.PI / 2

  // מיקרופון בגובה הדמות
  const metal = M(0x2a2a30, { metalness: .7, roughness: .35 }), chrome = M(0xd0d0dc, { metalness: .9, roughness: .2 })
  C(.3, .32, .04, metal, 0, .02, 1.0); C(.022, .022, 1.0, metal, 0, .52, 1.0)
  const mic = new THREE.Group(); mic.position.set(0, 1.08, .86); mic.rotation.x = -.25; scene.add(mic)
  mic.add(new THREE.Mesh(new THREE.CylinderGeometry(.075, .065, .24, 24), M(0x23232a, { metalness: .6, roughness: .3 })))
  const mh = new THREE.Mesh(new THREE.SphereGeometry(.085, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc9a46a, metalness: .85, roughness: .35 })); mh.position.y = .15; mic.add(mh)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.12, .008, 8, 32), chrome); ring.rotation.x = Math.PI / 2; mic.add(ring)
  mic.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true })
  add(new THREE.CircleGeometry(.17, 32), new THREE.MeshStandardMaterial({ color: 0x101014, transparent: true, opacity: .55, side: THREE.DoubleSide, roughness: 1 }), 0, 1.2, .62)
  add(new THREE.TorusGeometry(.17, .012, 8, 32), metal, 0, 1.2, .62)
  add(new THREE.CylinderGeometry(.008, .008, .32, 6), metal, 0, 1.1, .76).rotation.x = 1.0
  // מעמד תווים
  C(.015, .015, 1.1, metal, -1.15, .55, .75); B(.62, .44, .03, metal, -1.15, 1.12, .75).rotation.x = -.45
  B(.54, .38, .005, M(0xf4f1ea, { roughness: .9 }), -1.15, 1.13, .77).rotation.x = -.45
  for (const q of [[-1.3, .6], [-1, .9], [-1.15, .55]]) B(.015, .02, .5, metal, q[0], .06, q[1] + .15).rotation.y = q[0] + .3
  // שרפרף (למצב שעון עבודה)
  C(.22, .22, .05, M(0x3a2c24, { roughness: .5 }), -2.4, .76, -.6); C(.025, .025, .74, metal, -2.4, .38, -.6)
  add(new THREE.TorusGeometry(.17, .012, 8, 24), metal, -2.4, .3, -.6).rotation.x = Math.PI / 2; C(.2, .22, .02, metal, -2.4, .01, -.6)
  // מנורה עומדת
  C(.2, .22, .03, M(0x2a2220, { metalness: .5, roughness: .4 }), -3.1, .015, -1.9); C(.018, .018, 1.55, M(0x8a6a3a, { metalness: .8, roughness: .3 }), -3.1, .8, -1.9)
  add(new THREE.CylinderGeometry(.2, .32, .36, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe6c2, emissive: 0xffb36b, emissiveIntensity: .9, side: THREE.DoubleSide, roughness: .9 }), -3.1, 1.72, -1.9)
  add(new THREE.SphereGeometry(.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2d6 }), -3.1, 1.64, -1.9)
  // גיטרה תלויה
  const gt = new THREE.Group(); gt.position.set(1.8, 1.05, -2.78); gt.scale.setScalar(1.25); scene.add(gt)
  const topM = M(0xa8682c, { roughness: .35 }), sideM = M(0x7a4a22, { roughness: .4 }), neckM = M(0x5a341a, { roughness: .5 }), fbM = M(0x2a1a10, { roughness: .6 })
  const bout = (rad: number, y: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, .1, 40), [sideM, topM, sideM]); m.rotation.x = Math.PI / 2; m.position.y = y; m.castShadow = true; gt.add(m) }
  bout(.3, 0); bout(.23, .36)
  const gpart = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); gt.add(o); return o }
  gpart(new THREE.BoxGeometry(.36, .2, .1), topM, 0, .19, 0)
  gpart(new THREE.CircleGeometry(.075, 32), new THREE.MeshBasicMaterial({ color: 0x140c06 }), 0, .3, .051)
  gpart(new THREE.RingGeometry(.08, .095, 32), M(0x3a2414), 0, .3, .052)
  gpart(new THREE.BoxGeometry(.16, .03, .02), fbM, 0, -.1, .06)
  gpart(new THREE.BoxGeometry(.07, .78, .05), neckM, 0, .95, .02)
  gpart(new THREE.BoxGeometry(.066, .8, .01), fbM, 0, .93, .05)
  gpart(new THREE.BoxGeometry(.1, .2, .04), neckM, 0, 1.42, .01)
  for (let pg = 0; pg < 6; pg++) gpart(new THREE.CylinderGeometry(.012, .012, .05, 8), chrome, pg < 3 ? -.07 : .07, 1.36 + (pg % 3) * .06, .01).rotation.z = Math.PI / 2
  for (let st = 0; st < 6; st++) gpart(new THREE.BoxGeometry(.003, 1.45, .003), chrome, -.025 + st * .01, .62, .058)
  // מגבר
  const tolex = M(0x1c1612, { roughness: .7 })
  RB(.95, .72, .42, .04, tolex, 2.75, .37, -2.6)
  add(new THREE.PlaneGeometry(.8, .42), new THREE.MeshStandardMaterial({ map: grillTex, roughness: 1 }), 2.75, .3, -2.385)
  const gold = M(0xc8a060, { metalness: .8, roughness: .3 })
  B(.84, .015, .01, gold, 2.75, .52, -2.383); B(.84, .015, .01, gold, 2.75, .08, -2.383); B(.015, .45, .01, gold, 2.335, .3, -2.383); B(.015, .45, .01, gold, 3.165, .3, -2.383)
  B(.86, .1, .01, M(0x2a2420), 2.75, .64, -2.385)
  for (let kn = 0; kn < 6; kn++) C(.022, .022, .03, gold, 2.45 + kn * .12, .64, -2.37).rotation.x = Math.PI / 2
  add(new THREE.TorusGeometry(.12, .018, 8, 20, Math.PI), M(0x111111), 2.75, .73, -2.6)
  // עציץ
  C(.26, .2, .48, new THREE.MeshStandardMaterial({ map: potTex, roughness: .95 }), 3.55, .24, -.2); C(.25, .25, .02, M(0x3a2a1c), 3.55, .47, -.2)
  const leafMs = [M(0x3f8f3a, { roughness: .8, flatShading: true }), M(0x4fa547, { roughness: .8, flatShading: true }), M(0x2f7a32, { roughness: .8, flatShading: true })]
  for (let lf = 0; lf < 90; lf++) {
    const th = rnd(lf + 1) * Math.PI * 2, ph = Math.acos(2 * rnd(lf + 50) - 1), rr = .36 + rnd(lf + 99) * .1
    add(new THREE.IcosahedronGeometry(.09 + rnd(lf + 7) * .05, 0), leafMs[lf % 3], 3.55 + Math.sin(ph) * Math.cos(th) * rr, .95 + Math.cos(ph) * rr * .85, -.2 + Math.sin(ph) * Math.sin(th) * rr).rotation.set(rnd(lf) * 3, rnd(lf + 3) * 3, 0)
  }
  // דלת עם פס זהב ונורה אדומה מעליה
  B(.04, 2.3, 1.1, M(0x2a1e30, { roughness: .6 }), 4.47, 1.15, -1.9)
  const led = new THREE.MeshBasicMaterial({ color: 0xc9a46a })
  B(.02, 2.36, .04, led, 4.46, 1.18, -2.47); B(.02, 2.36, .04, led, 4.46, 1.18, -1.33)
  const redB = add(new THREE.SphereGeometry(.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0x441018 }), 4.42, 2.6, -1.9)

  // ---------- הדמויות ----------
  let crew: Member[] = [], mixR = 0, mixW = 0, workOn = false, recOn = false, cur: RoomClient | null = null
  const STOOL = new THREE.Vector3(-2.4, 0, -.2), DOOR = new THREE.Vector3(4.1, 0, -1.6), MICP = new THREE.Vector3(0, 0, .86)
  const faceMic = (x: number, z: number) => Math.atan2(MICP.x - x, MICP.z - z)
  const REC1: Spot[] = [{ p: new THREE.Vector3(0, 0, .15), f: 0 }]
  const REC3: Spot[] = [{ p: new THREE.Vector3(-.62, 0, .38), f: faceMic(-.62, .38) }, { p: new THREE.Vector3(0, 0, .12), f: 0 }, { p: new THREE.Vector3(.62, 0, .38), f: faceMic(.62, .38) }]
  const WORK1: Spot[] = [{ p: STOOL.clone(), sit: true }]
  const WORK3: Spot[] = [{ p: STOOL.clone(), sit: true }, { p: new THREE.Vector3(1.55, 0, -1.45), f: .35 }, { p: new THREE.Vector3(2.2, 0, -1.2), f: -.3 }]
  const spots = () => { const g = !!cur?.is_group; return workOn ? (g ? WORK3 : WORK1) : (g ? REC3 : REC1) }

  // אקולייזר צף במצב עבודה
  const eq = new THREE.Group(); eq.position.set(0, 2.3, -2.0); scene.add(eq)
  const bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = []
  for (let q = 0; q < 29; q++) { const bb = new THREE.Mesh(new THREE.BoxGeometry(.12, 1, .08), new THREE.MeshBasicMaterial({ color: 0xc9a46a, transparent: true, opacity: .95 })); bb.position.x = -2.52 + q * .18; eq.add(bb); bars.push(bb) }
  eq.visible = false
  const night = new THREE.PointLight(0x4d7bff, 0, 10); night.position.set(0, 2.6, 1.5); scene.add(night)

  const sendTo = (m: Member, spot: Spot, dur: number, delay = 0) => {
    const from = m.ch.position.clone(); from.y = 0; m.seated = false; m.spot = spot
    m.walk = { t0: performance.now() + delay, dur: REDUCED ? 1 : dur, from, mid: from.clone().lerp(spot.p, .5).add(new THREE.Vector3(.3, 0, .5)), to: spot.p.clone() }
  }
  const sameClient = (a: RoomClient | null, b: RoomClient | null) =>
    !!a && !!b && a.color_a === b.color_a && a.color_b === b.color_b && !!a.is_group === !!b.is_group

  function setClient(c: RoomClient | null) {
    if (sameClient(c, cur) && crew.length) return
    crew.forEach(m => scene.remove(m.ch)); crew = []; cur = c
    if (!c) return
    const sp = spots()
    memberColors(c).forEach((cc, i) => {
      const ch = makeChar(cc[0], cc[1], { phones: true }); ch.position.copy(DOOR); ch.rotation.y = -Math.PI / 2; scene.add(ch)
      crew.push({ ch, i, spot: sp[i], walk: { t0: performance.now() + i * 550, dur: REDUCED ? 1 : 2800, from: DOOR.clone(), mid: new THREE.Vector3(1.6, 0, -.2 + i * .15), to: sp[i].p.clone() } })
    })
  }
  let leaveDone: (() => void) | null = null
  function leave(onDone: () => void) {
    if (!crew.length) { onDone(); return }
    leaveDone = onDone
    crew.forEach((m, i) => {
      if (m.seated) { m.ch.position.y = 0; const u = m.ch.userData; u.legs[0].rotation.x = u.legs[1].rotation.x = 0 }
      const from = m.ch.position.clone(); from.y = 0; m.seated = false; m.leaving = true
      m.walk = { t0: performance.now() + i * 350, dur: REDUCED ? 1 : 2200, from, mid: new THREE.Vector3(1.6, 0, -.2 + i * .15), to: DOOR.clone() }
    })
  }
  function setWork(on: boolean, c?: RoomClient | null) {
    if (workOn === on && !c) return
    workOn = on
    if (on && c) { const a = new THREE.Color(c.color_a), b = new THREE.Color(c.color_b); bars.forEach((m, i) => m.material.color.copy(a).lerp(b, i / (bars.length - 1))) }
    const sp = spots(); crew.forEach((m, i) => sendTo(m, sp[i], 1800, i * 300))
  }

  const resize = () => { const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix() }
  const ro = new ResizeObserver(resize); ro.observe(cv); resize()

  const tmp = new THREE.Vector3()
  let raf = 0, alive = true
  const loop = (now: number) => {
    if (!alive) return
    const t = now / 1000
    mixR += ((recOn ? 1 : 0) - mixR) * (REDUCED ? 1 : .04)
    mixW += ((workOn && !recOn ? 1 : 0) - mixW) * (REDUCED ? 1 : .04)
    hemi.intensity = (.55 + .25 * mixR) * (1 - .6 * mixW); key.intensity = mixR * 2.4; warm.intensity = (.3 + .5 * mixR) * (1 - .5 * mixW); fill.intensity = .4 - .15 * mixR; night.intensity = mixW * 1.4
    eq.visible = mixW > .02
    bars.forEach((m, i) => {
      let h = (.15 + .85 * Math.abs(Math.sin(t * 3.1 + i * .47) * Math.sin(t * 1.3 + i * .21))) * 1.1 * mixW + .01
      if (REDUCED) h = (.3 + .5 * Math.abs(Math.sin(i * .6))) * mixW + .01
      m.scale.y = h; m.position.y = h / 2 - .5
    })
    ;(redB.material as THREE.MeshBasicMaterial).color.setHex(recOn ? (Math.sin(t * 5) > 0 ? 0xff2244 : 0x991020) : 0x441018)
    for (const m of crew) {
      const ch = m.ch, u = ch.userData, ti = t + m.i * .37
      if (m.walk) {
        if (now < m.walk.t0) { idlePose(ch, ti, false); continue }
        const k = Math.max(0, Math.min(1, (now - m.walk.t0) / m.walk.dur)), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        const a = m.walk.from, b = m.walk.mid, c = m.walk.to, w1 = 1 - e
        tmp.set(w1 * w1 * a.x + 2 * w1 * e * b.x + e * e * c.x, 0, w1 * w1 * a.z + 2 * w1 * e * b.z + e * e * c.z)
        const dx = tmp.x - ch.position.x, dz = tmp.z - ch.position.z
        if (Math.abs(dx) + Math.abs(dz) > 1e-4) ch.rotation.y = Math.atan2(dx, dz)
        ch.position.copy(tmp); u.head.rotation.x = 0; walkPose(ch, ti * 9, 1)
        if (k >= 1) {
          m.walk = null; m.seated = !m.leaving && !!m.spot.sit
          if (m.leaving) {
            scene.remove(ch); crew = crew.filter(x => x !== m)
            if (!crew.length) { cur = null; const f = leaveDone; leaveDone = null; f?.() }
          }
        }
      } else if (m.seated) {
        ch.position.set(STOOL.x, .42, STOOL.z - .25); ch.rotation.y += (.35 - ch.rotation.y) * .1
        u.legs[0].rotation.x = u.legs[1].rotation.x = -1.45; u.arms[0].rotation.x = -.5; u.arms[1].rotation.x = -.5; u.torso.position.y = 0
        u.head.rotation.x = REDUCED ? 0 : .08 + Math.sin(t * 8) * .12; u.head.rotation.z = 0; u.tip.scale.setScalar(1 + .25 * Math.sin(t * 8))
      } else {
        ch.position.y = 0; const f = m.spot?.f ?? 0; ch.rotation.y += (f - ch.rotation.y) * .08
        idlePose(ch, ti, recOn && !workOn)
        u.head.rotation.x = workOn && !REDUCED ? .06 + Math.sin(t * 8 + m.i) * .1 : 0
      }
    }
    r.render(scene, cam)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  return {
    setClient, setWork, leave,
    setRec(on) { recOn = on },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect()
      scene.traverse(o => {
        const m = o as THREE.Mesh
        if (m.isMesh) { m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach(x => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose() }) }
      })
      r.dispose()
    },
  }
}
