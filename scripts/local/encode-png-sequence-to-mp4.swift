import AppKit
import AVFoundation
import CoreVideo

let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count == 5,
      let width = Int(arguments[2]),
      let height = Int(arguments[3]),
      let framesPerSecond = Int32(arguments[4]),
      width > 0, height > 0, framesPerSecond > 0 else {
  fputs("usage: encode-png-sequence-to-mp4.swift <frames-dir> <output.mp4> <width> <height> <fps>\n", stderr)
  exit(64)
}

let framesDirectory = URL(fileURLWithPath: arguments[0], isDirectory: true)
let output = URL(fileURLWithPath: arguments[1])
let frames = try FileManager.default.contentsOfDirectory(
  at: framesDirectory,
  includingPropertiesForKeys: nil,
  options: [.skipsHiddenFiles]
).filter { $0.pathExtension.lowercased() == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }

guard !frames.isEmpty else {
  fputs("no PNG frames found\n", stderr)
  exit(65)
}
if FileManager.default.fileExists(atPath: output.path) {
  try FileManager.default.removeItem(at: output)
}

let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  // Tag the conversion matrix explicitly so decoders do not guess SD vs HD colour.
  AVVideoColorPropertiesKey: [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
  ],
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: width * height * Int(framesPerSecond) * 3,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
  ],
])
input.expectsMediaDataInRealTime = false
let attributes: [String: Any] = [
  // premultipliedFirst + little-endian CGContext stores B, G, R, A bytes.
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
  kCVPixelBufferCGImageCompatibilityKey as String: true,
  kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
guard writer.canAdd(input) else { throw NSError(domain: "TouchLineVideo", code: 1) }
writer.add(input)
guard writer.startWriting() else { throw writer.error ?? NSError(domain: "TouchLineVideo", code: 2) }
writer.startSession(atSourceTime: .zero)

let colorSpace = CGColorSpaceCreateDeviceRGB()
for (index, file) in frames.enumerated() {
  while !input.isReadyForMoreMediaData {
    try await Task.sleep(nanoseconds: 10_000_000)
  }
  guard let image = NSImage(contentsOf: file),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    throw NSError(domain: "TouchLineVideo", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unreadable frame \(file.lastPathComponent)"])
  }
  var pixelBuffer: CVPixelBuffer?
  guard CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixelBuffer) == kCVReturnSuccess,
        let buffer = pixelBuffer else { throw NSError(domain: "TouchLineVideo", code: 4) }
  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
  guard let context = CGContext(
    data: CVPixelBufferGetBaseAddress(buffer),
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
  ) else { throw NSError(domain: "TouchLineVideo", code: 5) }
  context.interpolationQuality = .high
  context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
  let presentationTime = CMTime(value: CMTimeValue(index), timescale: framesPerSecond)
  guard adaptor.append(buffer, withPresentationTime: presentationTime) else {
    throw writer.error ?? NSError(domain: "TouchLineVideo", code: 6)
  }
}
input.markAsFinished()
await writer.finishWriting()
guard writer.status == .completed else { throw writer.error ?? NSError(domain: "TouchLineVideo", code: 7) }
print("{\"frames\":\(frames.count),\"output\":\"\(output.path)\"}")
