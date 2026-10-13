import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let outDir = args[2]
let scale = CGFloat(Double(args[3]) ?? 3.0)
guard let doc = CGPDFDocument(url as CFURL) else { print("cannot open"); exit(1) }
for i in 1...doc.numberOfPages {
    let page = doc.page(at: i)!
    let box = page.getBoxRect(.mediaBox)
    let w = Int(box.width * scale), h = Int(box.height * scale)
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)
    ctx.drawPDFPage(page)
    let img = ctx.makeImage()!
    let out = URL(fileURLWithPath: "\(outDir)/page\(i).png")
    let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
    print("page \(i): \(w)x\(h)")
}
