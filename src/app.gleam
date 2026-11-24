//// Animator -- an application for program-generated drawings.

import builtins
import data
import drawing
import editor
import errors
import gleam/float
import gleam/int
import gleam/list
import gleam/result
import gleam/string
import lustre
import lustre/attribute as attr
import lustre/effect.{type Effect}
import lustre/element.{type Element}
import lustre/element/html
import lustre/element/keyed
import lustre/event
import parser
import render
import shape.{type Path}

/// Your app's public address, once you've deployed it in Problem 13, such as
/// "https://your-username.github.io/animator/".
pub const public_url = "https://dpla524.github.io/animator/"

/// Set to True if you would like your app's URL included in the course gallery.
pub const include_app_in_gallery = True

/// A link to your video from Problem 14, which anyone with the link can watch.
pub const video_url = ""

/// Set to True if you would like your video included in the course gallery.
pub const include_video_in_gallery = False

const default_code = "fn draw(shape_slider: Int) -> List(Path) {\n  [Path(Line(Point(0, 0), Point(100, 100)), 0, 10, 2)]\n}\n"

// Stroke colour for every path. The canvas background is near-black, so this
// stays light enough to read.
const stroke_color = "#cfe3ff"

// shape_slider is the integer draw receives. The editor reference describes it
// as the closed range [0, 100].
const shape_min = 0

const shape_max = 100

// Speed is a multiple of normal. The canvas starts at 1. The left end is
// negative, so the drawing can play backward, and the right end is above 1.
const speed_min = -2.0

const speed_max = 3.0

const speed_normal = 1.0

// ── Model ──────────────────────────────────────────────────────────────────────

pub type Model {
  Model(
    // The code in the editor.
    source: String,
    // Whether the code editor is shown.
    code_open: Bool,
    output: String,
    // The integer currently passed to draw.
    shape_slider: Int,
    // Playback rate. 1 is normal, 0 is paused, and negative plays backward.
    speed: Float,
    // Saved drawings, in menu order, and the one open in the editor.
    drawings: List(#(String, String)),
    open: String,
    // Bumped when a new-drawing prompt is cancelled, so the menu redraws on
    // the drawing that is actually open.
    menu_rev: Int,
    // Ink Courier is running on top of the current drawing.
    riding: Bool,
    ride_status: String,
    // When true, the ride and the ink reveal are frozen.
    paused: Bool,
    // When true, the ride runs at double speed. The drawing slider is separate.
    fast: Bool,
    // Best finished rides, highest first. high_rank is the row just earned.
    high_scores: List(Int),
    high_rank: Int,
    high_lit: Bool,
  )
}

pub type Msg {
  SetCode(String)
  SetShape(String)
  SetSpeed(String)
  SelectDrawing(String)
  ToggleRide
  ToggleFast
  TogglePause
  RideStatus(String)
  HighScores(String, Int)
  ArmShine

  // Layout controls
  ToggleCode
}

// ── Init ───────────────────────────────────────────────────────────────────────

pub fn init(_flags: Nil) -> #(Model, Effect(Msg)) {
  let library = data.load()
  let source = case list.key_find(library.drawings, library.open) {
    Ok(source) -> source
    Error(Nil) -> default_code
  }
  #(
    Model(
      source: source,
      code_open: True,
      output: "",
      shape_slider: shape_min,
      speed: speed_normal,
      drawings: library.drawings,
      open: library.open,
      menu_rev: 0,
      riding: False,
      ride_status: "",
      paused: False,
      fast: False,
      high_scores: [],
      high_rank: -1,
      high_lit: False,
    ),
    // Effects that happen automatically at the start go here.
    effect.batch([
      editor.mount(source, SetCode),
      effect.from(fn(dispatch) { dispatch(SetCode(source)) }),
      effect.from(fn(dispatch) {
        watch_scores(fn(text, rank) { dispatch(HighScores(text, rank)) })
        set_score_map(library.open)
      }),
    ]),
  )
}

// Parse and evaluate a draw function at the given shape-slider value, returning
// the rendered paths on success, or a human-readable message on failure.
fn run_source(shape_slider: Int, source: String) -> Result(List(Path), String) {
  case parser.parse_program(source, builtins.global_frame()) {
    Error(msg) -> Error(msg)
    Ok(program) ->
      drawing.try_draw(shape_slider, program)
      // Convert Error(EvalError) to Error(String) with a useful error message.
      |> result.map_error(errors.error_message)
  }
}

// ── Update ─────────────────────────────────────────────────────────────────────

pub fn update(model: Model, msg: Msg) -> #(Model, Effect(Msg)) {
  case msg {
    ToggleCode -> #(Model(..model, code_open: !model.code_open), effect.none())

    // After each keystroke in the editor, evaluate user code and animate it.
    // set_drawing runs on every edit, including an empty list and a drawing
    // that did not change. reset_clock restarts the reveal; set_drawing alone
    // would keep the old time and show a finished drawing all at once.
    // Every edit is stored immediately, including code that does not parse.
    SetCode(text) -> {
      let drawings = write_source(model.drawings, model.open, text)
      data.save(data.Library(open: model.open, drawings: drawings))
      present(Model(..model, source: text, drawings: drawings), True)
    }

    // "" is the "new drawing" option. Any other value is a saved name.
    SelectDrawing(name) ->
      case name {
        "" -> add_drawing(model)
        _ -> open_drawing(model, name)
      }

    // A new shape replaces the drawing and leaves the playback rate alone.
    // The clock also stays put, so a finished drawing shows the new shape
    // complete instead of replaying.
    SetShape(text) ->
      case parse_shape(text) {
        Error(Nil) -> #(model, effect.none())
        Ok(n) -> present(Model(..model, shape_slider: n), False)
      }

    ToggleRide ->
      case model.riding {
        True -> #(
          Model(..model, riding: False, ride_status: "", paused: False),
          effect.from(fn(_) { stop_ride() }),
        )
        False -> #(
          Model(
            ..model,
            riding: True,
            ride_status: "Arrows follow the ink in that direction.",
          ),
          effect.from(fn(dispatch) {
            start_ride(fn(text) { dispatch(RideStatus(text)) })
          }),
        )
      }

    ToggleFast -> {
      let fast = !model.fast
      let pace = case fast {
        True -> 2.0
        False -> 1.0
      }
      #(
        Model(..model, fast: fast),
        effect.from(fn(_) { set_game_pace(pace) }),
      )
    }

    TogglePause ->
      case model.riding {
        False -> #(model, effect.none())
        True -> #(
          Model(..model, paused: !model.paused),
          effect.from(fn(_) { set_paused(!model.paused) }),
        )
      }

    RideStatus(text) ->
      case model.riding {
        True -> #(
          Model(..model, ride_status: text, paused: string.starts_with(text, "Paused")),
          effect.none(),
        )
        False -> #(model, effect.none())
      }

    // rank < 0 refreshes the saved list. A real rank turns the border light off
    // for one update, then ArmShine turns it back on so the sweep can replay.
    HighScores(text, rank) -> {
      let scores = parse_scores(text)
      case rank < 0 {
        True -> #(
          Model(..model, high_scores: scores, high_rank: -1, high_lit: False),
          effect.none(),
        )
        False -> #(
          Model(..model, high_scores: scores, high_rank: rank, high_lit: False),
          effect.from(fn(dispatch) { dispatch(ArmShine) }),
        )
      }
    }

    ArmShine -> #(Model(..model, high_lit: True), effect.none())

    // Speed never rebuilds the drawing.
    SetSpeed(text) ->
      case parse_rate(text) {
        Error(Nil) -> #(model, effect.none())
        Ok(rate) -> {
          let apply = case model.paused {
            True -> effect.from(fn(_) { remember_speed(rate) })
            False -> effect.from(fn(_) { render.set_speed(rate) })
          }
          #(Model(..model, speed: rate), apply)
        }
      }
  }
}

// Evaluate the current source at the current shape slider. restart is true
// for a code edit, which replays from the beginning, and false for a shape
// change, which only swaps the paths.
fn present(model: Model, restart: Bool) -> #(Model, Effect(Msg)) {
  case run_source(model.shape_slider, model.source) {
    Ok(paths) -> #(
      Model(..model, output: ""),
      push_drawing(paths, restart),
    )
    Error(msg) -> #(
      Model(..model, output: msg),
      push_drawing([], restart),
    )
  }
}

// Keep the latest editor text on the open drawing, then show `name`.
fn open_drawing(model: Model, name: String) -> #(Model, Effect(Msg)) {
  let drawings = write_source(model.drawings, model.open, model.source)
  case list.key_find(drawings, name) {
    Error(Nil) -> #(model, effect.none())
    Ok(source) ->
      case model.open == name && model.source == source {
        True -> #(
          Model(..model, drawings: drawings, menu_rev: model.menu_rev + 1),
          effect.none(),
        )
        False -> show_drawing(Model(..model, drawings: drawings), name, source)
      }
  }
}

fn add_drawing(model: Model) -> #(Model, Effect(Msg)) {
  case string.trim(data.prompt_drawing_name()) {
    "" -> #(
      Model(..model, menu_rev: model.menu_rev + 1),
      effect.none(),
    )
    name -> {
      let drawings = write_source(model.drawings, model.open, model.source)
      let drawings = case list.key_find(drawings, name) {
        Ok(_) -> drawings
        Error(Nil) -> list.append(drawings, [#(name, default_code)])
      }
      open_drawing(Model(..model, drawings: drawings, source: model.source), name)
    }
  }
}

// Mount `source` in the editor and animate it. Code that fails to parse or
// evaluate still appears in the editor; the canvas is cleared and the error
// is shown.
fn show_drawing(
  model: Model,
  name: String,
  source: String,
) -> #(Model, Effect(Msg)) {
  let drawings = write_source(model.drawings, name, source)
  data.save(data.Library(open: name, drawings: drawings))
  let switched = model.open != name
  let model =
    Model(
      ..model,
      open: name,
      source: source,
      drawings: drawings,
      high_scores: case switched {
        True -> []
        False -> model.high_scores
      },
      high_rank: case switched {
        True -> -1
        False -> model.high_rank
      },
      high_lit: case switched {
        True -> False
        False -> model.high_lit
      },
    )
  let #(shown, anim) = present(model, True)
  #(
    shown,
    effect.batch([
      editor.mount(source, SetCode),
      anim,
      effect.from(fn(_) { set_score_map(name) }),
    ]),
  )
}

fn write_source(
  drawings: List(#(String, String)),
  name: String,
  source: String,
) -> List(#(String, String)) {
  case name == "" {
    True -> drawings
    False ->
      case list.key_find(drawings, name) {
        Error(Nil) -> list.append(drawings, [#(name, source)])
        Ok(_) ->
          list.map(drawings, fn(drawing) {
            let #(drawing_name, _) = drawing
            case drawing_name == name {
              True -> #(name, source)
              False -> drawing
            }
          })
      }
  }
}

fn push_drawing(paths: List(Path), restart: Bool) -> Effect(Msg) {
  let rendered = list.map(paths, render.render_path(_, stroke_color))
  effect.from(fn(_dispatch) {
    render.set_drawing(rendered)
    case restart {
      True -> render.reset_clock()
      False -> Nil
    }
  })
}

// "0" and "100" from the slider ends, and a decimal if one is sent.
fn parse_shape(text: String) -> Result(Int, Nil) {
  case int.parse(text) {
    Ok(n) -> Ok(n)
    Error(_) -> result.map(float.parse(text), float.round)
  }
}

// A range input reports whole numbers as "1" or "-2" and fractions as "1.5".
// Gleam's float parser accepts only the fractional form, so whole numbers
// come through the integer parser.
fn parse_rate(text: String) -> Result(Float, Nil) {
  case float.parse(text) {
    Ok(n) -> Ok(n)
    Error(_) -> result.map(int.parse(text), int.to_float)
  }
}

// ── View ──────────────────────────────────────────────────────────────────
//
// Two side-by-side panes: the code editor on the left and the animation on
// the right. The code column can be hidden to expand the right pane.

pub fn view(model: Model) -> Element(Msg) {
  let app_class = case model.code_open {
    True -> "app"
    False -> "app code-hidden"
  }
  // The code column still exists even when hidden (CSS collapses it) so the
  // mounted CodeMirror editor keeps its state across show/hide.
  html.div([attr.class(app_class)], [
    html.div([attr.class("code-col")], [
      editor.view_panel(view_menu(model), ToggleCode),
    ]),
    view_anim(model),
  ])
}

// The library menu. The blank option asks for a new name; every other option
// is a saved drawing, and the selected one is the drawing open in the editor.
fn view_menu(model: Model) -> Element(Msg) {
  keyed.div([attr.class("drawing-menu")], [
    #(int.to_string(model.menu_rev), html.label(
      [attr.class("drawing-menu-label")],
      [
        html.span([attr.class("drawing-menu-name")], [html.text("drawing")]),
        html.select(
          [
            attr.class("drawing-select"),
            attr.attribute("data-test-id", "drawing-select"),
            attr.value(model.open),
            event.on_change(SelectDrawing),
          ],
          list.append(
            list.map(model.drawings, fn(drawing) {
              let #(name, _) = drawing
              html.option(
                [attr.value(name), attr.selected(name == model.open)],
                name,
              )
            }),
            [html.option([attr.value("")], "New drawing…")],
          ),
        ),
      ],
    )),
  ])
}

fn view_anim(model: Model) -> Element(Msg) {
  html.div([attr.class("canvas-area")], [
    view_reveal_code(model),
    html.div(
      [
        attr.class("stage"),
        attr.id("game-stage"),
        attr.attribute("tabindex", "0"),
      ],
      [
        html.canvas([attr.id("animation-canvas"), attr.class("canvas")]),
        html.canvas([attr.id("game-canvas"), attr.class("game-canvas")]),
        view_high_scores(model),
      ],
    ),
    view_ride(model),
    view_controls(model),
    view_error(model),
  ])
}

fn view_high_scores(model: Model) -> Element(Msg) {
  let class = case model.high_lit {
    True -> "high-scores lit"
    False -> "high-scores"
  }
  let scores = list.take(model.high_scores, 5)
  let rows =
    list.map([0, 1, 2, 3, 4], fn(i) {
      let row = case model.high_lit && i == model.high_rank {
        True -> "new"
        False -> "rank"
      }
      case list.drop(scores, i) |> list.first {
        Ok(n) ->
          html.li([attr.class(row)], [
            html.span([attr.class("place")], [html.text(int.to_string(i + 1))]),
            html.span([attr.class("points")], [html.text(int.to_string(n))]),
          ])
        Error(_) ->
          html.li([attr.class("rank empty")], [
            html.span([attr.class("place")], [html.text(int.to_string(i + 1))]),
            html.span([attr.class("points")], [html.text("—")]),
          ])
      }
    })
  html.div([attr.class(class), attr.id("high-scores")], [
    html.div([attr.class("high-scores-glow")], []),
    html.div([attr.class("high-scores-body")], [
      html.div([attr.class("high-kicker")], [html.text("Top 5")]),
      html.div([attr.class("high-title")], [
        html.text(score_title(model.open)),
      ]),
      html.ol([], rows),
    ]),
  ])
}

fn score_title(name: String) -> String {
  case name {
    "" -> "High scores"
    _ -> string.replace(name, "_", " ")
  }
}

fn parse_scores(text: String) -> List(Int) {
  case text {
    "" -> []
    _ -> string.split(text, ",") |> list.filter_map(int.parse) |> list.take(5)
  }
}

fn view_ride(model: Model) -> Element(Msg) {
  let text = case model.riding, model.ride_status {
    False, _ ->
      "Arrows follow the ink in that direction. Space dashes."
    True, "" -> "Arrows follow the ink in that direction."
    True, status -> status
  }
  html.div([attr.class("ride-hud")], [html.text(text)])
}

// Both sliders are in the first view, so they are on the page when the app
// opens. The test ids sit on the <input> elements.
fn view_controls(model: Model) -> Element(Msg) {
  let ride_label = case model.riding {
    True -> "Stop"
    False -> "Ride"
  }
  let fast_class = case model.fast {
    True -> "ride-btn on"
    False -> "ride-btn"
  }
  html.div([attr.class("playback")], [
    html.button(
      [attr.class("ride-btn"), event.on_click(ToggleRide)],
      [html.text(ride_label)],
    ),
    html.button(
      [
        attr.class(fast_class),
        attr.attribute("title", "Ride at double speed"),
        event.on_click(ToggleFast),
      ],
      [html.text("2×")],
    ),
    case model.riding {
      False -> element.none()
      True ->
        html.button(
          [
            attr.class("ride-btn"),
            attr.attribute("title", "Pause the ride"),
            event.on_click(TogglePause),
          ],
          [
            html.text(case model.paused {
              True -> "Resume"
              False -> "Pause"
            }),
          ],
        )
    },
    slider(
      "shape",
      int.to_string(model.shape_slider),
      int.to_string(shape_min),
      int.to_string(shape_max),
      "1",
      "shape-slider",
      SetShape,
    ),
    slider(
      "speed",
      float.to_string(model.speed),
      float.to_string(speed_min),
      float.to_string(speed_max),
      "0.1",
      "speed-slider",
      SetSpeed,
    ),
  ])
}

fn slider(
  label: String,
  value: String,
  min: String,
  max: String,
  step: String,
  test_id: String,
  on_value: fn(String) -> Msg,
) -> Element(Msg) {
  html.label([attr.class("slider-field")], [
    html.span([attr.class("slider-name")], [html.text(label)]),
    html.input([
      attr.type_("range"),
      attr.min(min),
      attr.max(max),
      attr.step(step),
      attr.value(value),
      attr.attribute("data-test-id", test_id),
      event.on_input(on_value),
      event.on_change(on_value),
    ]),
    html.span([attr.class("slider-value")], [html.text(value)]),
  ])
}

// A parse or evaluation error, overlaid on the canvas. Nothing is rendered
// while the current program is valid.
fn view_error(model: Model) -> Element(Msg) {
  case model.output {
    "" -> element.none()
    message -> html.pre([attr.class("canvas-error")], [html.text(message)])
  }
}

// The button that brings the code column back, overlaid on the top-left of the
// right pane. Nothing is rendered while the column is already showing (its own
// header holds the button that hides it).
fn view_reveal_code(model: Model) -> Element(Msg) {
  case model.code_open {
    True -> element.none()
    False ->
      html.button(
        [
          attr.class("icon-btn reveal-code"),
          attr.attribute("title", "Show code"),
          event.on_click(ToggleCode),
        ],
        [html.text("⟩")],
      )
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

// Ink Courier. The loop lives beside the animation canvas and only reports
// when the score line changes, so the editor is not re-rendered every frame.
@external(javascript, "./game_ffi.mjs", "startRide")
fn start_ride(on_status: fn(String) -> Nil) -> Nil

@external(javascript, "./game_ffi.mjs", "stopRide")
fn stop_ride() -> Nil

@external(javascript, "./game_ffi.mjs", "setGamePace")
fn set_game_pace(pace: Float) -> Nil

@external(javascript, "./game_ffi.mjs", "setPaused")
fn set_paused(paused: Bool) -> Nil

@external(javascript, "./game_ffi.mjs", "rememberSpeed")
fn remember_speed(rate: Float) -> Nil

@external(javascript, "./game_ffi.mjs", "watchScores")
fn watch_scores(callback: fn(String, Int) -> Nil) -> Nil

@external(javascript, "./game_ffi.mjs", "setScoreMap")
fn set_score_map(name: String) -> Nil

pub fn main() -> Nil {
  let app = lustre.application(init, update, view)
  let assert Ok(_) = lustre.start(app, "#app", Nil)
  Nil
}
