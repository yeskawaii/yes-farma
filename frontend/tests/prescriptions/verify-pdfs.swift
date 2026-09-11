// macOS visual-test companion: verifies the actual browser-generated PDF output.
import Foundation
import PDFKit
import AppKit
let directory = "/tmp/yeskira-prescription-print-review"
for count in [1, 3, 30] {
    for status in ["ISSUED", "CANCELLED"] {
        let name = "\(count)-\(status)"
        guard let pdf = PDFDocument(url: URL(fileURLWithPath: "\(directory)/\(name).pdf")) else { fatalError("Missing PDF: \(name)") }
        if count == 1 { assert(pdf.pageCount == 1, "A short prescription must fit one letter page") }
        let text = pdf.string ?? ""
        for required in ["Clínica dental de prueba", "RECETA ODONTOLÓGICA", "Fecha: 11/9/2026", "Consultorio de prueba", "Paciente de prueba"] { assert(text.contains(required), "Missing document identification: \(required)") }
        assert(text.contains("Firma del profesional"), "Missing signature")
        assert(text.contains("TEST-123456"), "Missing license")
        assert(!text.contains("Selecciona papel Carta"), "Web controls leaked into PDF")
        for n in 1...count { assert(text.contains("MEDICAMENTO DE PRUEBA \(n)"), "Missing medication \(n)") }
        for i in 0..<pdf.pageCount {
            let page = pdf.page(at: i)!
            let bounds = page.bounds(for: .mediaBox)
            assert(abs(bounds.width - 612) < 1 && abs(bounds.height - 792) < 1, "Not letter paper")
            let pageText = page.string ?? ""
            assert(pageText.contains("MEDICAMENTO") || pageText.contains("Firma del profesional") || pageText.contains("INDICACIONES GENERALES"), "Blank document page")
            if i == 0 || i == pdf.pageCount - 1 { assert(pageText.contains("RX-1234567890ABCDEF1234567890ABCDEF"), "Missing document folio") }
            if status == "CANCELLED" { assert(pageText.contains("RECETA ANULADA"), "Missing cancelled marking on page \(i)") }
        }
        for pageNumber in Set([0, pdf.pageCount - 1]) {
            let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 850, pixelsHigh: 1100, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
            let context = NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext
            context.setFillColor(NSColor.white.cgColor)
            context.fill(CGRect(x: 0, y: 0, width: 850, height: 1100))
            context.scaleBy(x: 850.0 / 612.0, y: 1100.0 / 792.0)
            pdf.page(at: pageNumber)!.draw(with: .mediaBox, to: context)
            try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(directory)/\(name)-page-\(pageNumber + 1).png"))
        }
        print("PASS \(name): \(pdf.pageCount) letter pages, complete medications, signature, document folio and cancellation marking")
    }
}
