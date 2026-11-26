// רנדרר אחד שקוף מעל כל המסך: מצייר את תמונות הדמויות לכרטיסים,
// ומריץ את המעבר שבו הדמות יוצאת מהכרטיס והולכת לדלת.
import * as THREE from 'three'
import { makeChar, memberColors, idlePose, walkPose, hasWebGL, REDUCED, type Char } from './character'

type AvaClient = { color_a: string; color_b: string; is_group: number | null }

let ov: { r: THREE.WebGLRenderer; scene: THREE.Scene; canvas: HTMLCanvasElement } | null = null
const cache = new Map<string, string>()

function overlay() {
  if (ov) return ov
  if (!hasWebGL()) return null
  let canvas = document.getElementById('overlay') as HTMLCanvasElement | null
  if (!canvas) {
    canvas = document.createElement('canvas'); canvas.id = 'overlay'; canvas.setAttribute('aria-hidden', 'true')
    document.body.appendChild(canvas)
  }
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    r.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3460, 1.0))
    const dl = new THREE.DirectionalLight(0xffffff, .8); dl.position.set(2, 4, 5); scene.add(dl)
    ov = { r, scene, canvas }
  } catch { ov = null }
  return ov
}

/** תמונת הדמות (PNG כ-data URL) לכרטיס. נשמרת במטמון לפי הצבעים */
export function avatar(c: AvaClient): string {
  const key = `${c.color_a}|${c.color_b}|${c.is_group ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit
  const o = overlay()
  if (!o) return ''
  const cam = new THREE.OrthographicCamera(-.72, .72, .8, -.64, -10, 20)
  cam.position.set(0, .7, 6); cam.lookAt(0, .7, 0)
  o.r.setPixelRatio(1); o.r.setSize(180, 180, false)
  const grp = new THREE.Group(); o.scene.add(grp)
  if (c.is_group) {
    memberColors(c).forEach((cc, i) => {
      const ch = makeChar(cc[0], cc[1]); const x = [-.4, 0, .4][i]
      ch.scale.setScalar(i === 1 ? .78 : .68); ch.position.set(x, i === 1 ? -.12 : -.02, i === 1 ? .3 : 0); ch.rotation.y = -x * .9
      idlePose(ch, i, false)
      if (i === 1) { ch.userData.arms[1].rotation.x = -1.9; ch.userData.arms[1].rotation.z = .4 }
      grp.add(ch)
    })
  } else {
    const ch = makeChar(c.color_a, c.color_b); ch.rotation.y = -.45; ch.position.y = -.05; idlePose(ch, 0, false)
    ch.userData.arms[1].rotation.x = -1.9; ch.userData.arms[1].rotation.z = .4 // מנופף
    grp.add(ch)
  }
  o.r.render(o.scene, cam)
  const url = o.canvas.toDataURL('image/png')
  o.scene.remove(grp)
  cache.set(key, url)
  return url
}

/**
 * המעבר: הדמות קופצת מהכרטיס, הולכת לדלת זוהרת ונכנסת. כשנגמר, onDone.
 * בלי WebGL או עם "הפחתת תנועה" עוברים ישר.
 */
export function walkOut(avaEl: HTMLElement, c: AvaClient, onDone: () => void) {
  const o = overlay()
  const door = document.getElementById('door')!, flash = document.getElementById('flash')!
  if (!o || REDUCED) { onDone(); return }
  const W = window.innerWidth, H = window.innerHeight
  const cr = avaEl.getBoundingClientRect()
  o.canvas.style.display = 'block'
  o.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); o.r.setSize(W, H, false)
  const cam = new THREE.OrthographicCamera(0, W, H, 0, -1000, 1000); cam.position.z = 500
  const scale = Math.max(60, Math.min(90, W / 14)) * (c.is_group ? .8 : 1)
  const ch = new THREE.Group(); o.scene.add(ch)
  const cols = memberColors(c)
  const mates: Char[] = cols.map((cc, i) => {
    const m = makeChar(cc[0], cc[1]); m.position.x = (i - (cols.length - 1) / 2) * .55; m.position.z = i === 1 ? .2 : 0; ch.add(m); return m
  })
  ch.scale.setScalar(scale)
  const sx = cr.left + cr.width / 2, sy = H - (cr.top + cr.height * .95)
  // הדלת בצד שמאל של המסך (הכיוון "קדימה" בעברית)
  const dx = Math.max(70, W * .08)
  const dy = Math.min(H - 60, Math.max(140, H * .35))
  door.style.left = (dx - 42) + 'px'; door.style.top = (H - dy - 122) + 'px'; door.classList.add('on')
  const t0 = performance.now(), POP = 600, WALK = Math.max(1400, Math.min(2400, Math.hypot(sx - dx, sy - dy) * 2.2)), IN = 450, total = POP + WALK + IN
  const dir = dx < sx ? 1 : -1
  const f = (now: number) => {
    const el = Math.max(0, now - t0), t = now / 1000
    if (el < POP) {
      const k = el / POP, e = 1 - Math.pow(1 - k, 3)
      ch.position.set(sx, sy + Math.sin(k * Math.PI) * scale * .9, 50); ch.scale.setScalar(scale * (.35 + .65 * e)); ch.rotation.y = -e * dir
      mates.forEach((m, i) => { idlePose(m, t + i, false); m.userData.arms[0].rotation.x = m.userData.arms[1].rotation.x = -2.4 * Math.sin(k * Math.PI) })
    } else if (el < POP + WALK) {
      const k = (el - POP) / WALK, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      ch.position.set(sx + (dx - sx) * e, sy + (dy - sy) * e, 50); ch.scale.setScalar(scale); ch.rotation.y = -dir * 1.15
      mates.forEach((m, i) => walkPose(m, t * 11 + i * 1.3, 1))
    } else {
      const k = Math.min(1, (el - POP - WALK) / IN)
      ch.position.set(dx - k * 10, dy + k * 8, -50); ch.scale.setScalar(scale * (1 - .5 * k)); ch.rotation.y = -Math.PI * (.4 + .6 * k)
      mates.forEach((m, i) => walkPose(m, t * 11 + i * 1.3, 1 - k))
      flash.style.opacity = String(k * .9)
    }
    o.r.render(o.scene, cam)
    if (el < total) { requestAnimationFrame(f); return }
    o.scene.remove(ch); o.r.clear(); o.canvas.style.display = 'none'; door.classList.remove('on')
    onDone()
    setTimeout(() => { flash.style.opacity = '0' }, 140)
  }
  requestAnimationFrame(f)
}

/**
 * ההפך מ-walkOut: בסוף סשן הדמות יוצאת מהדלת, הולכת חזרה לכרטיס שלה ונכנסת אליו.
 */
export function walkBack(avaEl: HTMLElement, c: AvaClient, onDone: () => void) {
  const o = overlay()
  const door = document.getElementById('door'), flash = document.getElementById('flash')
  if (!o || REDUCED || !door) { onDone(); return }
  if (flash) flash.style.opacity = '0'
  const W = window.innerWidth, H = window.innerHeight
  const cr = avaEl.getBoundingClientRect()
  o.canvas.style.display = 'block'
  o.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); o.r.setSize(W, H, false)
  const cam = new THREE.OrthographicCamera(0, W, H, 0, -1000, 1000); cam.position.z = 500
  const scale = Math.max(60, Math.min(90, W / 14)) * (c.is_group ? .8 : 1)
  const ch = new THREE.Group(); o.scene.add(ch)
  const cols = memberColors(c)
  const mates: Char[] = cols.map((cc, i) => {
    const m = makeChar(cc[0], cc[1]); m.position.x = (i - (cols.length - 1) / 2) * .55; m.position.z = i === 1 ? .2 : 0; ch.add(m); return m
  })
  const sx = cr.left + cr.width / 2, sy = H - (cr.top + cr.height * .95)
  const dx = Math.max(70, W * .08)
  const dy = Math.min(H - 60, Math.max(140, H * .35))
  door.style.left = (dx - 42) + 'px'; door.style.top = (H - dy - 122) + 'px'; door.classList.add('on')
  const t0 = performance.now(), OUT = 450, WALK = Math.max(1400, Math.min(2400, Math.hypot(sx - dx, sy - dy) * 2.2)), DROP = 550, total = OUT + WALK + DROP
  const dir = sx > dx ? 1 : -1
  const f = (now: number) => {
    const el = Math.max(0, now - t0), t = now / 1000
    if (el < OUT) {
      const k = el / OUT
      ch.position.set(dx + (1 - k) * 10, dy + (1 - k) * 8, 50); ch.scale.setScalar(scale * (.5 + .5 * k)); ch.rotation.y = dir * 1.15
      mates.forEach((m, i) => walkPose(m, t * 11 + i * 1.3, k))
    } else if (el < OUT + WALK) {
      const k = (el - OUT) / WALK, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      ch.position.set(dx + (sx - dx) * e, dy + (sy - dy) * e, 50); ch.scale.setScalar(scale); ch.rotation.y = dir * 1.15
      mates.forEach((m, i) => walkPose(m, t * 11 + i * 1.3, 1))
      if (k > .3) door.classList.remove('on')
    } else {
      const k = Math.min(1, (el - OUT - WALK) / DROP), e = k * k
      ch.position.set(sx, sy + Math.sin(k * Math.PI) * scale * .6, 50); ch.scale.setScalar(scale * (1 - .65 * e)); ch.rotation.y = dir * 1.15 * (1 - k)
      mates.forEach((m, i) => idlePose(m, t + i, false))
    }
    o.r.render(o.scene, cam)
    if (el < total) { requestAnimationFrame(f); return }
    o.scene.remove(ch); o.r.clear(); o.canvas.style.display = 'none'; door.classList.remove('on')
    onDone()
  }
  requestAnimationFrame(f)
}
