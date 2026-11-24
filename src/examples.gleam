//// The drawings that a browser with no saved library starts with: each one's
//// name and source.

pub const all = [
  #(
    "fan",
    "fn draw(shape_slider: Int) -> List(Path) {
  fan(30, Point(-200, -200))
}

fn fan(n: Int, start: Point) -> List(Path) {
  case n > 0 {
    True -> [Path(Line(start, Point(n * 10, 200)), 0, 30, 3), ..fan(n - 1, start)]
    False -> []
  }
}
",
  ),
  #(
    "square_spiral",
    "fn draw(shape_slider: Int) -> List(Path) {
  let turns = 20 + shape_slider / 4
  spiral(Point(0, 0), Point(1, 0), 0, turns)
}

fn spiral(p: Point, d: Point, i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> {
      let len = { i / 2 + 1 } * 24
      let q = Point(p.x + d.x * len, p.y + d.y * len)
      [
        Path(Line(p, q), i * 3, i * 3 + 3, 3),
        ..spiral(q, Point(0 - d.y, d.x), i + 1, n)
      ]
    }
  }
}
",
  ),
  #(
    "string_art",
    "fn draw(shape_slider: Int) -> List(Path) {
  let n = 8 + shape_slider / 10
  list.flatten([
    quadrant(1, 1, n, 0),
    quadrant(-1, 1, n, n + 1),
    quadrant(-1, -1, n, { n + 1 } * 2),
    quadrant(1, -1, n, { n + 1 } * 3),
  ])
}

fn quadrant(sx: Int, sy: Int, n: Int, base: Int) -> List(Path) {
  strings(0, sx, sy, n, base)
}

fn strings(i: Int, sx: Int, sy: Int, n: Int, base: Int) -> List(Path) {
  case i > n {
    True -> []
    False -> {
      let a = Point(sx * 420 * i / n, 0)
      let b = Point(0, sy * 420 * { n - i } / n)
      let t = { base + i } * 2
      [Path(Line(a, b), t, t + 8, 2), ..strings(i + 1, sx, sy, n, base)]
    }
  }
}
",
  ),
  #(
    "tree",
    "fn draw(shape_slider: Int) -> List(Path) {
  let depth = 4 + shape_slider / 20
  branch(Point(0, 420), Point(0, -220), 0, depth)
}

fn branch(p: Point, d: Point, level: Int, depth: Int) -> List(Path) {
  case level == depth {
    True -> []
    False -> {
      let q = Point(p.x + d.x, p.y + d.y)
      let left = Point({ d.x - d.y } / 2, { d.y + d.x } / 2)
      let right = Point({ d.x + d.y } / 2, { d.y - d.x } / 2)
      [
        Path(Line(p, q), level * 4, level * 4 + 4, depth - level),
        ..list.append(
          branch(q, left, level + 1, depth),
          branch(q, right, level + 1, depth),
        )
      ]
    }
  }
}
",
  ),
  #(
    "ladder",
    "fn draw(shape_slider: Int) -> List(Path) {
  let n = 4 + 2 * { shape_slider / 16 }
  list.flatten([
    [
      Path(Line(Point(0 - 150, 0 - 320), Point(0 - 150, 320)), 0, 8, 3),
      Path(Line(Point(150, 0 - 320), Point(150, 320)), 0, 8, 3),
    ],
    rungs(0, n),
  ])
}

fn rungs(i: Int, n: Int) -> List(Path) {
  case i > n {
    True -> []
    False -> {
      let y = 0 - 320 + 640 * i / n
      let t = 2 + i
      [Path(Line(Point(0 - 150, y), Point(150, y)), t, t + 4, 3), ..rungs(i + 1, n)]
    }
  }
}
",
  ),
  #(
    "courtyard",
    "fn draw(shape_slider: Int) -> List(Path) {
  let rings = 3 + shape_slider / 25
  list.flatten([squares(0, rings), arms(0, rings)])
}

fn squares(i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> list.append(square(70 + i * 62, i * 4), squares(i + 1, n))
  }
}

fn square(r: Int, t: Int) -> List(Path) {
  [
    Path(Line(Point(0 - r, 0 - r), Point(r, 0 - r)), t, t + 4, 3),
    Path(Line(Point(r, 0 - r), Point(r, r)), t, t + 4, 3),
    Path(Line(Point(r, r), Point(0 - r, r)), t, t + 4, 3),
    Path(Line(Point(0 - r, r), Point(0 - r, 0 - r)), t, t + 4, 3),
  ]
}

fn arms(i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> {
      let inner = case i == 0 {
        True -> 0
        False -> 70 + { i - 1 } * 62
      }
      let outer = 70 + i * 62
      let t = i * 3
      [
        Path(Line(Point(0 - outer, 0), Point(0 - inner, 0)), t, t + 3, 3),
        Path(Line(Point(inner, 0), Point(outer, 0)), t, t + 3, 3),
        Path(Line(Point(0, 0 - outer), Point(0, 0 - inner)), t, t + 3, 3),
        Path(Line(Point(0, inner), Point(0, outer)), t, t + 3, 3),
        ..arms(i + 1, n)
      ]
    }
  }
}
",
  ),
  #(
    "skyline",
    "fn draw(shape_slider: Int) -> List(Path) {
  let n = 5 + shape_slider / 8
  [Path(Line(Point(0 - 340, 0), Point(340, 0)), 0, 6, 3), ..teeth(0, n)]
}

fn teeth(i: Int, n: Int) -> List(Path) {
  case i > n {
    True -> []
    False -> {
      let x = 0 - 340 + 680 * i / n
      let h = 110 + { i * 47 } % 220
      let t = 3 + i
      [Path(Line(Point(x, 0), Point(x, 0 - h)), t, t + 4, 3), ..teeth(i + 1, n)]
    }
  }
}
",
  ),
  #(
    "switchback",
    "fn draw(shape_slider: Int) -> List(Path) {
  let rows = 8 + shape_slider / 10
  list.flatten([lanes(0, rows), drops(0, rows)])
}

fn lanes(i: Int, n: Int) -> List(Path) {
  case i > n {
    True -> []
    False -> {
      let y = { i - n / 2 } * 48
      let t = i * 2
      let run = case i % 2 == 0 {
        True -> Path(Line(Point(0 - 300, y), Point(300, y)), t, t + 4, 3)
        False -> Path(Line(Point(300, y), Point(0 - 300, y)), t, t + 4, 3)
      }
      case i == n {
        True -> [run]
        False -> {
          let x = case i % 2 == 0 {
            True -> 300
            False -> 0 - 300
          }
          [
            run,
            Path(Line(Point(x, y), Point(x, y + 48)), t, t + 3, 3),
            ..lanes(i + 1, n)
          ]
        }
      }
    }
  }
}

fn drops(i: Int, n: Int) -> List(Path) {
  case i + 1 > n {
    True -> []
    False -> {
      let y = { i - n / 2 } * 48
      let t = 16 + i
      [Path(Line(Point(0, y), Point(0, y + 48)), t, t + 3, 2), ..drops(i + 2, n)]
    }
  }
}
",
  ),
  #(
    "diamonds",
    "fn draw(shape_slider: Int) -> List(Path) {
  let rings = 4 + shape_slider / 25
  list.flatten([rings_of(0, rings), spokes(rings)])
}

fn rings_of(i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> list.append(diamond(48 + i * 60, i * 3), rings_of(i + 1, n))
  }
}

fn diamond(r: Int, t: Int) -> List(Path) {
  [
    Path(Line(Point(r, 0), Point(0, 0 - r)), t, t + 4, 3),
    Path(Line(Point(0, 0 - r), Point(0 - r, 0)), t, t + 4, 3),
    Path(Line(Point(0 - r, 0), Point(0, r)), t, t + 4, 3),
    Path(Line(Point(0, r), Point(r, 0)), t, t + 4, 3),
  ]
}

fn spokes(n: Int) -> List(Path) {
  let r = 48 + { n - 1 } * 60
  [
    Path(Line(Point(0 - r, 0), Point(0, 0)), 0, 6, 3),
    Path(Line(Point(0, 0), Point(r, 0)), 0, 6, 3),
    Path(Line(Point(0, 0 - r), Point(0, 0)), 0, 6, 3),
    Path(Line(Point(0, 0), Point(0, r)), 0, 6, 3),
  ]
}
",
  ),
  #(
    "vine",
    "fn draw(shape_slider: Int) -> List(Path) {
  let levels = 4 + shape_slider / 12
  [Path(Line(Point(0, 300), Point(0, 0 - 300)), 0, 10, 3), ..limbs(0, levels)]
}

fn limbs(i: Int, n: Int) -> List(Path) {
  case i == n {
    True -> []
    False -> {
      let y = 240 - 520 * i / { n - 1 }
      let t = 2 + i * 2
      [
        Path(Line(Point(0, y), Point(150, y - 56)), t, t + 4, 3),
        Path(Line(Point(0, y), Point(0 - 150, y - 56)), t, t + 4, 3),
        ..limbs(i + 1, n)
      ]
    }
  }
}
",
  ),
  #(
    "blocks",
    "fn draw(shape_slider: Int) -> List(Path) {
  let n = 3 + shape_slider / 34
  list.flatten([h_lines(0 - n, n), v_lines(0 - n, n)])
}

fn h_lines(y: Int, n: Int) -> List(Path) {
  case y > n {
    True -> []
    False -> list.append(h_row(y, 0 - n, n), h_lines(y + 1, n))
  }
}

fn h_row(y: Int, x: Int, n: Int) -> List(Path) {
  case x >= n {
    True -> []
    False -> {
      let s = 64
      let t = { y + n } * 2
      [
        Path(Line(Point(x * s, y * s), Point({ x + 1 } * s, y * s)), t, t + 3, 8),
        ..h_row(y, x + 1, n)
      ]
    }
  }
}

fn v_lines(x: Int, n: Int) -> List(Path) {
  case x > n {
    True -> []
    False -> list.append(v_col(x, 0 - n, n), v_lines(x + 1, n))
  }
}

fn v_col(x: Int, y: Int, n: Int) -> List(Path) {
  case y >= n {
    True -> []
    False -> {
      let s = 64
      let t = { x + n } * 2 + 1
      [
        Path(Line(Point(x * s, y * s), Point(x * s, { y + 1 } * s)), t, t + 3, 8),
        ..v_col(x, y + 1, n)
      ]
    }
  }
}
",
  ),
  #(
    "braid",
    "fn draw(shape_slider: Int) -> List(Path) {
  let n = 4 + shape_slider / 10
  list.flatten([
    [
      Path(Line(Point(0 - 160, 0 - 320), Point(0 - 160, 320)), 0, 8, 3),
      Path(Line(Point(0, 0 - 320), Point(0, 320)), 0, 8, 3),
      Path(Line(Point(160, 0 - 320), Point(160, 320)), 0, 8, 3),
    ],
    stitches(0, n),
  ])
}

fn stitches(i: Int, n: Int) -> List(Path) {
  case i >= n {
    True -> []
    False -> {
      let y0 = 0 - 320 + 640 * i / n
      let y1 = 0 - 320 + 640 * { i + 1 } / n
      let t = 4 + i * 2
      case i % 2 == 0 {
        True -> [
          Path(Line(Point(0 - 160, y0), Point(0, y1)), t, t + 4, 3),
          Path(Line(Point(0, y0), Point(160, y1)), t, t + 4, 3),
          ..stitches(i + 1, n)
        ]
        False -> [
          Path(Line(Point(0, y0), Point(0 - 160, y1)), t, t + 4, 3),
          Path(Line(Point(160, y0), Point(0, y1)), t, t + 4, 3),
          ..stitches(i + 1, n)
        ]
      }
    }
  }
}
",
  ),
  #(
    "rooms",
    "fn draw(shape_slider: Int) -> List(Path) {
  let rings = 1 + shape_slider / 34
  wings(0, rings)
}

fn wings(k: Int, n: Int) -> List(Path) {
  case k == n {
    True -> []
    False -> list.append(ring(k), wings(k + 1, n))
  }
}

fn ring(k: Int) -> List(Path) {
  list.flatten([
    corner(1, 0 - 1, k),
    corner(1, 1, k),
    corner(0 - 1, 1, k),
    corner(0 - 1, 0 - 1, k),
  ])
}

fn corner(sx: Int, sy: Int, k: Int) -> List(Path) {
  let inner = 80 + k * 140
  let outer = inner + 90
  let t = k * 6
  let door = Point(sx * inner, sy * inner)
  let far_x = Point(sx * outer, sy * inner)
  let far = Point(sx * outer, sy * outer)
  let far_y = Point(sx * inner, sy * outer)
  let from = case k == 0 {
    True -> Point(0, 0)
    False -> Point(sx * { inner - 50 }, sy * { inner - 50 })
  }
  [
    Path(Line(from, door), t, t + 4, 3),
    Path(Line(door, far_x), t + 2, t + 6, 3),
    Path(Line(far_x, far), t + 2, t + 6, 3),
    Path(Line(far, far_y), t + 2, t + 6, 3),
    Path(Line(far_y, door), t + 2, t + 6, 3),
  ]
}
",
  ),
  #(
    "track",
    "fn draw(shape_slider: Int) -> List(Path) {
  let loops = 2 + shape_slider / 34
  list.flatten([ovals(0, loops), bridges(0, loops), infield()])
}

fn half_w(k: Int) -> Int {
  90 + k * 110
}

fn half_h(k: Int) -> Int {
  60 + k * 80
}

fn ovals(k: Int, n: Int) -> List(Path) {
  case k == n {
    True -> []
    False -> list.append(oval(k), ovals(k + 1, n))
  }
}

fn oval(k: Int) -> List(Path) {
  let x = half_w(k)
  let y = half_h(k)
  let t = k * 5
  [
    Path(Line(Point(0 - x, 0 - y), Point(x, 0 - y)), t, t + 4, 3),
    Path(Line(Point(x, 0 - y), Point(x, y)), t, t + 4, 3),
    Path(Line(Point(x, y), Point(0 - x, y)), t, t + 4, 3),
    Path(Line(Point(0 - x, y), Point(0 - x, 0 - y)), t, t + 4, 3),
  ]
}

fn bridges(k: Int, n: Int) -> List(Path) {
  case k + 1 >= n {
    True -> []
    False -> {
      let x0 = half_w(k)
      let x1 = half_w(k + 1)
      let y0 = half_h(k)
      let y1 = half_h(k + 1)
      let t = 8 + k * 3
      [
        Path(Line(Point(x0, 0), Point(x1, 0)), t, t + 3, 3),
        Path(Line(Point(0 - x1, 0), Point(0 - x0, 0)), t, t + 3, 3),
        Path(Line(Point(0, 0 - y0), Point(0, 0 - y1)), t, t + 3, 3),
        Path(Line(Point(0, y1), Point(0, y0)), t, t + 3, 3),
        ..bridges(k + 1, n)
      ]
    }
  }
}

fn infield() -> List(Path) {
  [
    Path(Line(Point(0 - 90, 0), Point(90, 0)), 0, 4, 3),
    Path(Line(Point(0, 0 - 60), Point(0, 60)), 0, 4, 3),
  ]
}
",
  ),
]
