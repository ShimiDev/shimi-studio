// הדמות של כל לקוח: רובוט קטן בצבעים של הלקוח. מגיע ישר מהאב־טיפוס.
// בעתיד אפשר להחליף את הפונקציה הזו בטעינת מודל GLB מ-Spline או Blender.
import * as THREE from 'three'

export type ColorPair = [string, string]
export interface CharParts {
  legs: THREE.Group[]
  arms: THREE.Group[]
  torso: THREE.Group
  head: THREE.Group
  tip: THREE.Mesh
}
export type Char = THREE.Group & { userData: CharParts }

export const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function makeChar(c1: string, c2: string, opts: { phones?: boolean } = {}): Char {
  const g = new THREE.Group() as Char
  const M = (c: THREE.ColorRepresentation, o: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color: c, roughness: .38, metalness: .02, clearcoat: .6, clearcoatRoughness: .25, ...o })
  const body = M(c1), dark = M(0x1b1830, { roughness: .3 }), white = M(0xf6f4ff, { roughness: .35 }), acc = M(c2)
  const legs: THREE.Group[] = [], arms: THREE.Group[] = []
  for (const x of [-.1, .1]) {
    const lg = new THREE.Group(); lg.position.set(x, .36, 0)
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.065, .07, .34, 12), dark); m.position.y = -.17; lg.add(m)
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.085, 12, 8), acc); foot.scale.set(1, .6, 1.4); foot.position.set(0, -.34, .03); lg.add(foot)
    g.add(lg); legs.push(lg)
  }
  const torso = new THREE.Group(); g.add(torso)
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(.21, .25, .46, 20), body); tb.position.y = .6; torso.add(tb)
  const bot = new THREE.Mesh(new THREE.SphereGeometry(.25, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), body); bot.position.y = .37; torso.add(bot)
  const sh = new THREE.Mesh(new THREE.SphereGeometry(.21, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), body); sh.position.y = .83; torso.add(sh)
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.252, .252, .06, 20), acc); belt.position.y = .48; torso.add(belt)
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(.27 * s, .8, 0)
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .32, 10), body); m.position.y = -.15; a.add(m)
    const h = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 8), white); h.position.y = -.33; a.add(h)
    a.rotation.z = .12 * s; torso.add(a); arms.push(a)
  }
  const head = new THREE.Group(); head.position.y = 1.12; torso.add(head)
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.25, 24, 16), white))
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.2, 24, 12, -.9, 1.8, 1.1, .9), dark); visor.position.z = .07; head.add(visor)
  const eyeM = new THREE.MeshBasicMaterial({ color: c1 })
  for (const x of [-.07, .07]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), eyeM); e.position.set(x, .02, .255); e.scale.set(1, 1.3, .6); head.add(e)
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .16, 6), dark); ant.position.y = .3; head.add(ant)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), new THREE.MeshBasicMaterial({ color: c2 })); tip.position.y = .4; head.add(tip)
  if (opts.phones) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.27, .03, 8, 24, Math.PI), dark); band.position.y = .02; head.add(band)
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .08, 16), acc); cup.rotation.z = Math.PI / 2; cup.position.set(.27 * s, 0, 0); head.add(cup)
    }
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true })
  g.userData = { legs, arms, torso, head, tip }
  return g
}

export function walkPose(ch: Char, ph: number, amt: number) {
  const u = ch.userData, s = Math.sin(ph) * amt
  u.legs[0].rotation.x = s * .7; u.legs[1].rotation.x = -s * .7
  u.arms[0].rotation.x = -s * .6; u.arms[1].rotation.x = s * .6
  u.torso.position.y = Math.abs(Math.cos(ph)) * .05 * amt
}

export function idlePose(ch: Char, t: number, sing: boolean) {
  const u = ch.userData
  u.legs[0].rotation.x = u.legs[1].rotation.x = 0
  u.arms[0].rotation.x = sing ? -.9 + Math.sin(t * 3) * .15 : Math.sin(t * 1.5) * .05
  u.arms[1].rotation.x = sing ? -.4 : -Math.sin(t * 1.5) * .05
  u.torso.position.y = Math.sin(t * (sing ? 4 : 2)) * .015
  u.head.rotation.z = sing ? Math.sin(t * 2) * .12 : Math.sin(t * .8) * .05
  u.tip.scale.setScalar(1 + .25 * Math.sin(t * 5))
}

/** להקה/מקהלה = שלוש דמויות בווריאציות של צבעי הלקוח */
export function memberColors(c: { color_a: string; color_b: string; is_group: number | null }): ColorPair[] {
  if (!c.is_group) return [[c.color_a, c.color_b]]
  const mid = '#' + new THREE.Color(c.color_a).lerp(new THREE.Color(c.color_b), .5).getHexString()
  return [[c.color_b, c.color_a], [c.color_a, c.color_b], [mid, c.color_a]]
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}
