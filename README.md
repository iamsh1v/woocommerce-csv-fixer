# Woocommerce CSV Fixer

**Fix broken WooCommerce CSV files instantly — right in your browser.**

A free, open-source tool that detects and repairs common issues in WooCommerce product CSV files. No server, no uploads, no sign-up. Your data never leaves your device.

## What It Fixes

| Issue | What Happens |
|-------|-------------|
| **Duplicate Variation SKUs** | Generates unique SKUs for each variation |
| **Missing Variation Attributes** | Assigns correct attribute values from parent product |
| **Junk Variations** | Removes fake variations (Packaging, Composition, etc.) |
| **Junk Parent Attributes** | Cleans metadata mixed into attribute values |
| **Misordered Variations** | Groups variations right after their parent product |
| **Missing Required Fields** | Sets Tax status, In stock, Published, etc. |
| **Variable Products With Price** | Clears price (should be on variations only) |
| **Variations With Name** | Clears name (WooCommerce auto-generates it) |

## How to Use

1. Visit the [live site](https://iamsh1v.github.io/woocommerce-csv-fixer)
2. Drop your CSV file
3. Review detected issues
4. Click **Fix & Download**

That's it. Your fixed CSV is ready to import into WooCommerce via **Products > Import**.

## Privacy

This tool runs **100% in your browser**. Your CSV file is never uploaded to any server. All processing happens locally on your device using JavaScript.

## Contributing

Pull requests are welcome! If you find a new type of CSV issue that should be fixed, please open an issue with a sample CSV.

## License

MIT
