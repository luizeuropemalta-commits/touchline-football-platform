// Offline evidence only. This never approves an artwork or posts to a destination.
import AVFoundation
import CoreGraphics
import CoreVideo
import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ProbeError: Error { case invalidArguments, outputExists, invalidVideo, decodeFailed, imageFailed }

func writePNG(_ image: CGImage, to url: URL) throws {
  guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw ProbeError.imageFailed }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else { throw ProbeError.imageFailed }
}

func inspectPixels(_ buffer: CVPixelBuffer, includeImage: Bool) throws -> (String, CGImage?) {
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
  let stride = CVPixelBufferGetBytesPerRow(buffer)
  guard let base = CVPixelBufferGetBaseAddress(buffer), stride >= width * 4 else { throw ProbeError.decodeFailed }
  var digest = SHA256()
  // Hash only actual pixels, never uninitialised alignment bytes.
  for row in 0..<height { digest.update(data: Data(bytes: base.advanced(by: row * stride), count: width * 4)) }
  let checksum = digest.finalize().map { String(format: "%02x", $0) }.joined()
  if !includeImage { return (checksum, nil) }
  guard let context = CGContext(data: base, width: width, height: height, bitsPerComponent: 8,
    bytesPerRow: stride, space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
    let image = context.makeImage() else { throw ProbeError.imageFailed }
  return (checksum, image)
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count == 2 else {
  fputs("usage: probe-social-studio-video.swift <input.mp4> <new-evidence-directory>\n", stderr)
  exit(64)
}
let inputURL = URL(fileURLWithPath: arguments[0]).standardizedFileURL
let outputURL = URL(fileURLWithPath: arguments[1], isDirectory: true).standardizedFileURL
guard inputURL.pathExtension.lowercased() == "mp4" else { throw ProbeError.invalidArguments }
guard !FileManager.default.fileExists(atPath: outputURL.path) else { throw ProbeError.outputExists }
let inputBytes = try Data(contentsOf: inputURL, options: .mappedIfSafe)
let artifactSha = "sha256:" + SHA256.hash(data: inputBytes).map { String(format: "%02x", $0) }.joined()
let asset = AVURLAsset(url: inputURL)
let duration = CMTimeGetSeconds(try await asset.load(.duration))
let tracks = try await asset.loadTracks(withMediaType: .video)
guard duration.isFinite, duration > 0, duration <= 60, tracks.count == 1 else { throw ProbeError.invalidVideo }
let track = tracks[0]
let descriptions = try await track.load(.formatDescriptions)
let transform = try await track.load(.preferredTransform)
guard let description = descriptions.first,
  CMFormatDescriptionGetMediaSubType(description) == kCMVideoCodecType_H264,
  transform.isIdentity else { throw ProbeError.invalidVideo }
let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
output.alwaysCopiesSampleData = false
guard reader.canAdd(output) else { throw ProbeError.invalidVideo }
reader.add(output)
guard reader.startReading() else { throw reader.error ?? ProbeError.decodeFailed }
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: false)
var count = 0, width = 0, height = 0
var hashes = Set<String>()
var firstTime: Double?, lastTime: Double?, middleTime: Double?
var lastImage: CGImage?
while let sample = output.copyNextSampleBuffer() {
  try autoreleasepool {
    guard let buffer = CMSampleBufferGetImageBuffer(sample) else { throw ProbeError.decodeFailed }
    let timestamp = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
    guard timestamp.isFinite, timestamp >= 0, lastTime == nil || timestamp > lastTime! else { throw ProbeError.decodeFailed }
    let frameWidth = CVPixelBufferGetWidth(buffer), frameHeight = CVPixelBufferGetHeight(buffer)
    if count == 0 { width = frameWidth; height = frameHeight }
    guard width == frameWidth, height == frameHeight else { throw ProbeError.invalidVideo }
    let pixels = try inspectPixels(buffer, includeImage: true)
    guard let image = pixels.1 else { throw ProbeError.imageFailed }
    hashes.insert(pixels.0)
    if count == 0 { firstTime = timestamp; try writePNG(image, to: outputURL.appendingPathComponent("decoded-first.png")) }
    if middleTime == nil && timestamp >= duration / 2 {
      middleTime = timestamp
      try writePNG(image, to: outputURL.appendingPathComponent("decoded-middle.png"))
    }
    lastImage = image
    lastTime = timestamp
    count += 1
  }
}
guard reader.status == .completed, count > 0, let finalImage = lastImage else { throw reader.error ?? ProbeError.decodeFailed }
try writePNG(finalImage, to: outputURL.appendingPathComponent("decoded-last.png"))
let report: [String: Any] = [
  "artifactSha256": artifactSha, "decoder": "avfoundation", "codec": "h264",
  "width": width, "height": height, "durationSeconds": duration,
  "decodedFrames": count, "distinctFrames": hashes.count,
  "decoderCompleted": true, "loopSeamReviewed": false,
  "firstPresentationSeconds": firstTime ?? 0, "lastPresentationSeconds": lastTime ?? 0,
  "middlePresentationSeconds": middleTime.map { $0 as Any } ?? NSNull(),
  "reviewState": "DECODED_REQUIRES_VISUAL_REVIEW_OF_TWO_LOOPS",
  "probePlatform": ProcessInfo.processInfo.operatingSystemVersionString,
  "generatedAt": ISO8601DateFormatter().string(from: Date()),
  "decodedSamples": ["decoded-first.png", "decoded-middle.png", "decoded-last.png"]
]
let reportData = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
try reportData.write(to: outputURL.appendingPathComponent("probe.json"), options: .withoutOverwriting)
print(String(decoding: reportData, as: UTF8.self))
