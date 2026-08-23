const PDFDocument = require("pdfkit");
const Kyc = require("../models/Kyc");

function numberToWords(num) {
    const a = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
    ];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    function g(n) {
        if (n < 20) return a[n];
        let digit = n % 10;
        return b[Math.floor(n / 10)] + (digit ? " " + a[digit] : "");
    }

    function h(n) {
        if (n < 100) return g(n);
        return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + h(n % 100) : "");
    }

    const whole = Math.floor(num);
    const decimal = Math.round((num - whole) * 100);

    function convertWhole(n) {
        if (n === 0) return "Zero";
        let parts = [];
        
        let crore = Math.floor(n / 10000000);
        n %= 10000000;
        if (crore) {
            parts.push(h(crore) + " Crore");
        }

        let lakh = Math.floor(n / 100000);
        n %= 100000;
        if (lakh) {
            parts.push(h(lakh) + " Lakh");
        }

        let thousand = Math.floor(n / 1000);
        n %= 1000;
        if (thousand) {
            parts.push(h(thousand) + " Thousand");
        }

        if (n) {
            parts.push(h(n));
        }
        return parts.join(" ");
    }

    let result = convertWhole(whole) + " Rupees";
    if (decimal > 0) {
        result += " and " + g(decimal) + " Paisa";
    }
    return result + " Only";
}

exports.generateInvoicePDF = async (txn, user, type, res, isSample = false) => {
    // 1. Fetch details (Real vs. Sample)
    let buyerName, buyerAddress, buyerPan, placeOfSupply;

    if (isSample) {
        buyerName = "ARAVIND KUMAR";
        buyerAddress = "Flat No. 402, Royal Residency, Sector 12, Dwarka, New Delhi - 110075";
        buyerPan = "ABCDE1234F";
        placeOfSupply = "DELHI";
    } else {
        const kyc = await Kyc.findOne({ user: txn.user || user._id });
        buyerName = kyc ? kyc.fullName.toUpperCase() : user.name.toUpperCase();
        buyerAddress = kyc && kyc.address 
            ? `${kyc.address.line1}, ${kyc.address.city} - ${kyc.address.pincode}, ${kyc.address.state.toUpperCase()}`
            : "KYC Pending / Address not provided";
        buyerPan = kyc && kyc.panNumber ? kyc.panNumber.toUpperCase() : "N/A";
        placeOfSupply = kyc && kyc.address && kyc.address.state
            ? kyc.address.state.toUpperCase()
            : "DELHI";
    }

    // 2. Prep invoice variables
    const invoiceLabel = txn.invoiceNo || `TX-${String(txn._id).slice(-8).toUpperCase()}`;
    const invoiceDate = new Date(txn.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    const isBuy = ["buy", "sip_buy"].includes(txn.type);
    const assetName = type === "gold" ? "GOLD" : (type === "copper" ? "COPPER" : "SILVER");
    const purity = type === "gold" ? "999 - 24K" : (type === "copper" ? "999 - Pure Industrial" : "999");
    const hsn = type === "gold" ? "711419" : (type === "copper" ? "740311" : "711411");
    const grams = txn.grams;
    const rate = txn.ratePerGram;
    const value = type === "gold" ? txn.goldValue : (type === "copper" ? (txn.copperValue || (grams * rate)) : (txn.silverValue || txn.goldValue || (grams * rate)));
    const gstAmt = txn.gstAmt || 0;
    const totalAmt = txn.totalAmt;

    // GST calculations (always CGST + SGST, no IGST)
    const cgstSgstRateStr = isBuy && gstAmt > 0 ? "1.50% + 1.50%" : "0.00%";
    const cgstSgstAmtStr = isBuy && gstAmt > 0 ? gstAmt.toFixed(2) : "0.00";

    // 3. Initialize PDF document
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    // Color Palette: Deep Forest Green (#072E20) and Gold (#D4A017)
    const primaryColor = "#072E20";
    const goldColor = "#D4A017";
    const headerBg = "#E8F0EC"; // light green-gray tint

    // --- DRAW STRIPES AT TOP ---
    doc.rect(0, 0, 595, 12).fill(goldColor);
    doc.rect(0, 12, 595, 4).fill(primaryColor);

    // --- COMPANY DETAILS (TOP LEFT) ---
    doc.fillColor(primaryColor)
       .font("Helvetica-Bold")
       .fontSize(11.5)
       .text("PAYVIKA INDIA TECHNOLOGY PRIVATE LIMITED", 40, 28);

    doc.fillColor("#555")
       .font("Helvetica")
       .fontSize(7.5)
       .text("CIN: U66190DL2026PTC464009 | GSTIN: 09AAQCP7680Q1Z4", 40, 44);

    doc.fontSize(7)
       .fillColor("#444")
       .text("Registered Office: D36 S/F Ganesh Nagar, Pandav Nagar Complex, New Delhi - 110092", 40, 56)
       .text("Email: info@vikaone.com | Web: www.vikaone.com", 40, 66);

    // --- BRAND LOGO BOX (TOP RIGHT) ---
    doc.rect(440, 24, 115, 65).fill(primaryColor);
    doc.fillColor(goldColor)
       .font("Helvetica-Bold")
       .fontSize(11)
       .text("VIKAONE", 440, 34, { width: 115, align: "center" });
    doc.fillColor(goldColor)
       .font("Helvetica-Bold")
       .fontSize(15)
       .text("GOLD", 440, 48, { width: 115, align: "center" });
    doc.fillColor("#FFFFFF")
       .font("Helvetica-Bold")
       .fontSize(8)
       .text("FOR ALL", 440, 68, { width: 115, align: "center" });

    // --- SEPARATOR LINE ---
    doc.strokeColor(goldColor).lineWidth(1).moveTo(40, 100).lineTo(555, 100).stroke();

    // --- TAX INVOICE TITLE ---
    doc.fillColor(primaryColor)
       .font("Helvetica-Bold")
       .fontSize(12)
       .text("TAX INVOICE", 40, 112, { width: 515, align: "center" });

    // --- BUYER & INVOICE DETAILS GRID ---
    doc.strokeColor("#8A95B0").lineWidth(0.75).rect(40, 132, 515, 75).stroke();
    doc.moveTo(300, 132).lineTo(300, 207).stroke();

    // Left half: Buyer details
    doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(7.5).text("BUYER DETAILS:", 46, 138);
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(8.5).text(buyerName, 46, 148);
    doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text(buyerAddress, 46, 160, { width: 245 });
    if (buyerPan !== "N/A") {
        doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text(`PAN: ${buyerPan}`, 46, 192);
    }

    // Right half: Invoice details
    const drawInfoRow = (label, val, yOffset) => {
        doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(7.5).text(label, 306, yOffset);
        doc.fillColor("#000000").font("Helvetica").fontSize(7.5).text(val, 395, yOffset, { width: 150 });
    };
    drawInfoRow("Invoice No.:", invoiceLabel, 138);
    drawInfoRow("Invoice Date:", invoiceDate, 153);
    drawInfoRow("PLACE OF SUPPLY:", placeOfSupply, 168);

    // --- ITEMS TABLE (6 ROWS, NO IGST) ---
    const ys = [217, 237, 272, 292, 312, 332, 352, 372];
    
    // Draw background header row
    doc.rect(40, 217, 515, 20).fill(headerBg);

    // Header labels
    doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(7.5);
    doc.text("Sr No.", 40, 223, { width: 30, align: "center" });
    doc.text("Description", 72, 223, { width: 218, align: "left" });
    doc.text("HSN Code", 290, 223, { width: 50, align: "center" });
    doc.text("Grams", 340, 223, { width: 55, align: "right" });
    doc.text("Rate", 395, 223, { width: 65, align: "right" });
    doc.text("Per", 460, 223, { width: 30, align: "center" });
    doc.text("Amount", 490, 223, { width: 65, align: "right" });

    // Write row contents
    // Row 1: Item row
    const itemDescStr = `${assetName} - (${purity}) - ${txn._id.toString().toUpperCase()} @ ${rate.toFixed(2)}`;
    doc.fillColor("#000000").font("Helvetica").fontSize(7.5);
    doc.text("1", 40, 242, { width: 30, align: "center" });
    doc.text(itemDescStr, 72, 242, { width: 215 });
    doc.text(hsn, 290, 242, { width: 50, align: "center" });
    doc.text(grams.toFixed(4), 340, 242, { width: 55, align: "right" });
    doc.text(rate.toFixed(2), 395, 242, { width: 65, align: "right" });
    doc.text("1 GM", 460, 242, { width: 30, align: "center" });
    doc.text(value.toFixed(2), 490, 242, { width: 65, align: "right" });

    // Row 2: Taxable Value
    doc.font("Helvetica-Bold").text("TAXABLE VALUE", 72, 277);
    doc.font("Helvetica").text(grams.toFixed(4), 340, 277, { width: 55, align: "right" });
    doc.text(value.toFixed(2), 490, 277, { width: 65, align: "right" });

    // Row 3: CGST + SGST (Always displayed)
    doc.text("CGST + SGST", 72, 297);
    doc.text(cgstSgstRateStr, 395, 297, { width: 65, align: "right" });
    doc.text(cgstSgstAmtStr, 490, 297, { width: 65, align: "right" });

    // Row 4: Gross Invoice Amount
    doc.font("Helvetica-Bold").text("GROSS INVOICE AMOUNT", 72, 317);
    doc.text(totalAmt.toFixed(2), 490, 317, { width: 65, align: "right" });

    // Row 5: Discount
    doc.font("Helvetica").text("DISCOUNT", 72, 337);
    doc.text("0.00", 490, 337, { width: 65, align: "right" });

    // Row 6: Total Net Payable
    doc.font("Helvetica-Bold").text("TOTAL NET PAYABLE", 72, 357);
    doc.text(totalAmt.toFixed(2), 490, 357, { width: 65, align: "right" });

    // Draw all grid lines for the table
    doc.strokeColor("#8A95B0").lineWidth(0.75);
    for (let i = 0; i < ys.length; i++) {
        doc.moveTo(40, ys[i]).lineTo(555, ys[i]).stroke();
    }
    const xs = [40, 70, 290, 340, 395, 460, 490, 555];
    for (let i = 0; i < xs.length; i++) {
        doc.moveTo(xs[i], 217).lineTo(xs[i], 372).stroke();
    }

    // --- AMOUNT IN WORDS ---
    doc.fillColor("#000000")
       .font("Helvetica-Bold")
       .fontSize(8.5)
       .text(`Rupees ${numberToWords(totalAmt)}`, 40, 378);

    // --- LABELS BELOW TABLE ---
    doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text("E. & O.E.", 40, 395);
    doc.text("Delivery: Ex-office/Showroom/As per Customers request", 40, 405);

    // --- DISCLAIMER & TERMS BOX ---
    doc.strokeColor("#ccc").lineWidth(0.5).rect(40, 422, 515, 145).stroke();

    const disclaimerText = `The ${assetName.toLowerCase()} grams you own are calculated by dividing the amount paid net of GST by the ${assetName.toLowerCase()} rate and rounded down to 4 decimal places. For example, .00054 grams will be rounded down to .0005 grams.`;
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7.5).text("*Disclaimer", 46, 428);
    doc.fillColor("#333333").font("Helvetica").fontSize(7).text(disclaimerText, 46, 437, { width: 503 });

    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7.5).text("Terms & Conditions:", 46, 462);
    const terms = [
        "Goods once sold will not be returned.",
        "Any disputes shall be subject to Delhi jurisdiction.",
        "Our responsibility ceases once the goods are delivered to the customer.",
        "i/We hereby certify that my/our registration certificate under the Central Goods and Services Act, 2017 is in force on the date on which the sales of goods specified in this tax invoice is made by me/us and that the transaction of sale covered by this tax invoice has been effected by me/us and it shall be accounted for in the turnover of sales while filing of return and the due tax, if any, payable on the sale has been paid or shall be paid.",
        "This is system generated document hence signature is not required."
    ];
    let termY = 472;
    terms.forEach((term, index) => {
        doc.fillColor("#333333").font("Helvetica").fontSize(7);
        doc.text(`${index + 1}.`, 46, termY, { width: 10 });
        doc.text(term, 58, termY, { width: 491 });
        termY += doc.heightOfString(term, { width: 491 }) + 3;
    });

    // --- SIGNATURE SECTION ---
    doc.fillColor(primaryColor)
       .font("Helvetica-Bold")
       .fontSize(8)
       .text("For Payvika India Technology Private Limited", 300, 590, { width: 255, align: "right" });
    
    doc.fillColor(primaryColor)
       .font("Helvetica-Bold")
       .fontSize(8)
       .text("Authorised Signatory", 300, 640, { width: 255, align: "right" });

    // --- DRAW STRIPES AT BOTTOM ---
    doc.rect(0, 822, 595, 4).fill(primaryColor);
    doc.rect(0, 826, 595, 16).fill(goldColor);

    doc.end();
};
