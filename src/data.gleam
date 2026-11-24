//// The library of saved drawings. A drawing is a name and the source of its draw
//// function.
////
//// The whole library is one localStorage string. Each name and source is stored
//// verbatim after a grapheme count, so quotes, backslashes, line breaks, and
//// non-English letters appear in the stored text exactly as the user typed them.

import examples
import gleam/int
import gleam/list
import gleam/result
import gleam/string

// ── localStorage (data_ffi.mjs) ───────────────────────────────────────────────

/// The string stored in localStorage under key, or an Error if there isn't one.
@external(javascript, "./data_ffi.mjs", "storageGet")
pub fn storage_get(key: String) -> Result(String, Nil)

/// Store value in localStorage under key, replacing anything already there. If that
/// isn't possible, this logs the reason to the browser console.
@external(javascript, "./data_ffi.mjs", "storageSet")
pub fn storage_set(key: String, value: String) -> Nil

// ── The new-drawing prompt (data_ffi.mjs) ─────────────────────────────────────

/// Prompt the user to name a new drawing; "" (empty string) means they
/// cancelled or left it blank.
@external(javascript, "./data_ffi.mjs", "promptDrawingName")
pub fn prompt_drawing_name() -> String

// ── The saved library ─────────────────────────────────────────────────────────

const storage_key = "animator.drawings"

/// The open drawing's name, and every saved drawing as #(name, source), in
/// menu order.
pub type Library {
  Library(open: String, drawings: List(#(String, String)))
}

/// The library in localStorage, or the built-in examples when nothing usable
/// is stored. A stored library is kept as the user left it, including edits
/// to the examples. Built-in drawings that the library does not already name are
/// added on the end, so a new map appears without replacing saved work.
pub fn load() -> Library {
  case storage_get(storage_key) {
    Error(Nil) -> starter()
    Ok(text) ->
      case decode(text) {
        Ok(library) -> with_new_examples(library)
        Error(Nil) -> starter()
      }
  }
}

// Keep saved drawings, and append any example whose name is not already there.
fn with_new_examples(library: Library) -> Library {
  let refreshed = list.map(library.drawings, refresh_stock)
  let added =
    list.filter(examples.all, fn(drawing) {
      list.key_find(refreshed, drawing.0) == Error(Nil)
    })
  Library(..library, drawings: list.append(refreshed, added))
}

// A saved copy of blocks that still has the original thin strokes picks up
// the thicker streets. An edited copy is left alone.
fn refresh_stock(drawing: #(String, String)) -> #(String, String) {
  let #(name, source) = drawing
  case list.key_find(examples.all, name) {
    Error(_) -> drawing
    Ok(latest) ->
      case
        name == "blocks"
        && source != latest
        && string.contains(source, "let s = 64")
        && string.contains(source, "t + 3, 2")
      {
        True -> #(name, latest)
        False -> drawing
      }
  }
}

/// Replace the saved library. The open name is the drawing to show on reload.
pub fn save(library: Library) -> Nil {
  storage_set(storage_key, encode(library))
}

/// examples.all, opened on its first drawing.
fn starter() -> Library {
  case examples.all {
    [#(name, _), ..] -> Library(open: name, drawings: examples.all)
    [] -> Library(open: "", drawings: [])
  }
}

// Count, newline, then that many graphemes of the text itself.
fn field(text: String) -> String {
  int.to_string(string.length(text)) <> "\n" <> text
}

fn encode(library: Library) -> String {
  let body =
    list.fold(library.drawings, "", fn(acc, drawing) {
      let #(name, source) = drawing
      acc <> field(name) <> field(source)
    })
  field(library.open)
  <> int.to_string(list.length(library.drawings))
  <> "\n"
  <> body
}

fn decode(text: String) -> Result(Library, Nil) {
  use #(open, rest) <- result.try(take_field(text))
  use #(count_text, rest) <- result.try(string.split_once(rest, "\n"))
  use count <- result.try(int.parse(count_text))
  case count < 1 {
    True -> Error(Nil)
    False -> {
      use #(drawings, rest) <- result.try(take_drawings(count, rest, []))
      let open_is_listed = list.key_find(drawings, open) != Error(Nil)
      case rest == "" && open_is_listed {
        True -> Ok(Library(open: open, drawings: drawings))
        False -> Error(Nil)
      }
    }
  }
}

fn take_drawings(
  count: Int,
  rest: String,
  acc: List(#(String, String)),
) -> Result(#(List(#(String, String)), String), Nil) {
  case count {
    0 -> Ok(#(list.reverse(acc), rest))
    _ -> {
      use #(name, rest) <- result.try(take_field(rest))
      use #(source, rest) <- result.try(take_field(rest))
      // An empty name would share the "new drawing" option's value.
      // A repeated name would make the menu unable to tell them apart.
      case name == "" || list.key_find(acc, name) != Error(Nil) {
        True -> Error(Nil)
        False -> take_drawings(count - 1, rest, [#(name, source), ..acc])
      }
    }
  }
}

fn take_field(rest: String) -> Result(#(String, String), Nil) {
  use #(len_text, after) <- result.try(string.split_once(rest, "\n"))
  use n <- result.try(int.parse(len_text))
  let total = string.length(after)
  case n < 0 || n > total {
    True -> Error(Nil)
    False -> {
      // Slice by grapheme, not by UTF-8 byte size. drop_start measures the
      // prefix in bytes and then cuts a JavaScript string, which shifts the
      // rest of the library whenever a drawing contains a non-English letter.
      let value = string.slice(after, 0, n)
      let rest = string.slice(after, n, total - n)
      case string.length(value) == n {
        True -> Ok(#(value, rest))
        False -> Error(Nil)
      }
    }
  }
}
