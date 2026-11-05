import AppKit
import Foundation
// Optional macOS second opinion for spell.cjs --second-opinion. Never part of the manifest:
// NSSpellChecker also accepts the words each user taught their own Mac, so two Macs can disagree.
// usage: swift spell.swift words.txt [language] [garbage-word]
//   language      NSSpellChecker code: en_US (default), en_GB, uk, de, fr, …
//   garbage-word  a non-word in that script that MUST be flagged (self-test; default by script)
// prints the words the dictionary does not know, one per line
// exit 3: no system dictionary for that language · exit 4: self-test failed (a cold or broken dictionary passes everything)
let args = CommandLine.arguments
let path = args.count > 1 ? args[1] : "words.txt"
let lang = args.count > 2 ? args[2] : "en_US"
func err(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
let ch = NSSpellChecker.shared
if !ch.setLanguage(lang) { err("no dictionary: \(lang)"); exit(3) }
func flagged(_ w: String) -> Bool {
  return ch.checkSpelling(of: w, startingAt: 0, language: lang, wrap: false, inSpellDocumentWithTag: 0, wordCount: nil).location != NSNotFound
}
let base = lang.split(separator: "_").first.map(String.init) ?? lang
let defaultCanary: String = ["uk", "ru", "bg", "be", "mk", "sr"].contains(base) ? "щзщзщзщ" : (base == "el" ? "ξζξζξζξ" : "qacanaryzqxw")
let canary = args.count > 3 ? args[3] : defaultCanary
var ready = false
for _ in 0..<10 { if flagged(canary) { ready = true; break }; Thread.sleep(forTimeInterval: 0.3) }
if !ready { err("self-test failed: the \(lang) dictionary did not flag \(canary)"); exit(4) }
let text = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
for w in text.split(whereSeparator: { $0.isNewline }) {
  let s = String(w)
  if !s.isEmpty && s != canary && flagged(s) { print(s) }
}
