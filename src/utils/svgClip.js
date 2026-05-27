/**
 * SVG-to-3D clipping helpers — used by SvgIcon to keep icon geometry
 * inside the mirror's frame opening.
 *
 * Both algorithms operate on bounds = [width, height], centered at the
 * origin (i.e. clip rectangle is x ∈ [-w/2, w/2], y ∈ [-h/2, h/2]).
 */

/**
 * Cohen-Sutherland line clipping. Returns [p1, p2] truncated to the
 * bounds, or `null` if the segment is entirely outside.
 *
 * Points are {x, y} plain objects. Pass `bounds = null` to disable clipping
 * (returns the unmodified pair).
 */
export function clipLineSegment(p1, p2, bounds) {
  if (!bounds) return [p1, p2]

  const halfW = bounds[0] / 2
  const halfH = bounds[1] / 2

  const INSIDE = 0
  const LEFT = 1
  const RIGHT = 2
  const BOTTOM = 4
  const TOP = 8

  const outCode = (x, y) => {
    let code = INSIDE
    if (x < -halfW) code |= LEFT
    else if (x > halfW) code |= RIGHT
    if (y < -halfH) code |= BOTTOM
    else if (y > halfH) code |= TOP
    return code
  }

  let x1 = p1.x, y1 = p1.y
  let x2 = p2.x, y2 = p2.y
  let c1 = outCode(x1, y1)
  let c2 = outCode(x2, y2)

  while (true) {
    if (!(c1 | c2)) return [{ x: x1, y: y1 }, { x: x2, y: y2 }] // both inside
    if (c1 & c2) return null // both outside same region

    const cOut = c1 ? c1 : c2
    let x, y
    if (cOut & TOP) {
      x = x1 + ((x2 - x1) * (halfH - y1)) / (y2 - y1)
      y = halfH
    } else if (cOut & BOTTOM) {
      x = x1 + ((x2 - x1) * (-halfH - y1)) / (y2 - y1)
      y = -halfH
    } else if (cOut & RIGHT) {
      y = y1 + ((y2 - y1) * (halfW - x1)) / (x2 - x1)
      x = halfW
    } else {
      y = y1 + ((y2 - y1) * (-halfW - x1)) / (x2 - x1)
      x = -halfW
    }

    if (cOut === c1) {
      x1 = x; y1 = y; c1 = outCode(x1, y1)
    } else {
      x2 = x; y2 = y; c2 = outCode(x2, y2)
    }
  }
}

/**
 * Sutherland-Hodgman polygon clipping. Returns the clipped polygon
 * point list (possibly empty). Operates on a closed polygon — points
 * connect cyclically.
 */
export function clipPolygon(points, bounds) {
  if (!bounds || points.length < 2) return points

  const halfW = bounds[0] / 2
  const halfH = bounds[1] / 2

  const edges = [
    {
      inside: (p) => p.x >= -halfW,
      intersect: (a, b) => ({
        x: -halfW,
        y: a.y + ((b.y - a.y) * (-halfW - a.x)) / (b.x - a.x),
      }),
    },
    {
      inside: (p) => p.x <= halfW,
      intersect: (a, b) => ({
        x: halfW,
        y: a.y + ((b.y - a.y) * (halfW - a.x)) / (b.x - a.x),
      }),
    },
    {
      inside: (p) => p.y >= -halfH,
      intersect: (a, b) => ({
        x: a.x + ((b.x - a.x) * (-halfH - a.y)) / (b.y - a.y),
        y: -halfH,
      }),
    },
    {
      inside: (p) => p.y <= halfH,
      intersect: (a, b) => ({
        x: a.x + ((b.x - a.x) * (halfH - a.y)) / (b.y - a.y),
        y: halfH,
      }),
    },
  ]

  let output = [...points]
  for (const { inside, intersect } of edges) {
    if (output.length === 0) break
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]
      const next = input[(i + 1) % input.length]
      const curIn = inside(cur)
      const nextIn = inside(next)
      if (curIn) {
        output.push(cur)
        if (!nextIn) output.push(intersect(cur, next))
      } else if (nextIn) {
        output.push(intersect(cur, next))
      }
    }
  }
  return output
}
