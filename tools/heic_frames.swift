// Turns a macOS dynamic wallpaper (.heic) into the photos the home screen fades through: web/wp-0.jpg, web/wp-1.jpg …
// in the order of the day, 1920 × 1080 JPEGs. web/wallpaper.js expects 16 of them, 1.5 h apart from midnight, as in
// Mojave's dynamic desktop.
//
//     swift tools/heic_frames.swift ~/Downloads/Mojave.heic web
//
// macOS only (ImageIO reads the HEIC and its schedule).
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3, let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil) else {
  FileHandle.standardError.write("usage: swift tools/heic_frames.swift <wallpaper.heic> <out dir>\n".data(using: .utf8)!)
  exit(1)
}
let count = CGImageSourceGetCount(src)

/// The frames in the order of the day, from the wallpaper's time schedule (apple_desktop:h24); without one, as stored.
func dayOrder() -> [Int] {
  guard let meta = CGImageSourceCopyMetadataAtIndex(src, 0, nil),
        let tag = CGImageMetadataCopyTagWithPath(meta, nil, "apple_desktop:h24" as CFString),
        let b64 = CGImageMetadataTagCopyValue(tag) as? String, let data = Data(base64Encoded: b64),
        let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
        let times = plist["ti"] as? [[String: Any]] else { return Array(0..<count) }
  return times.sorted { ($0["t"] as? Double ?? 0) < ($1["t"] as? Double ?? 0) }.compactMap { $0["i"] as? Int }
}

let order = dayOrder()
for (k, i) in order.enumerated() {
  guard let img = CGImageSourceCreateImageAtIndex(src, i, nil),
        let ctx = CGContext(data: nil, width: 1920, height: 1080, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
  else { continue }
  ctx.interpolationQuality = .high
  let s = max(1920.0 / Double(img.width), 1080.0 / Double(img.height))
  let w = Double(img.width) * s, h = Double(img.height) * s
  ctx.draw(img, in: CGRect(x: (1920 - w) / 2, y: (1080 - h) / 2, width: w, height: h))
  let out = URL(fileURLWithPath: args[2]).appendingPathComponent("wp-\(k).jpg")
  let dst = CGImageDestinationCreateWithURL(out as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, ctx.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.72] as CFDictionary)
  CGImageDestinationFinalize(dst)
}
print("Wrote \(order.count) photos to \(args[2])" + (order.count == 16 ? "" : " (web/wallpaper.js expects 16)"))
