/**
 * Removes contact details from text before it is sent to an AI provider.
 * The AI never needs these: forms are filled from the profile directly.
 */
export function stripPii(text: string): string {
  return (
    text
      // emails
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      // phone numbers: (555) 123-4567, 555.123.4567, +1 555 123 4567
      .replace(/(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]")
      // street addresses: "123 Main St", "4500 N. Oak Avenue Apt 2"
      .replace(
        /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Pkwy|Parkway)\b\.?(?:,?\s*(?:Apt|Unit|Suite|#)\s*\w+)?/g,
        "[address]",
      )
      // US ZIP codes following a state abbreviation: "CA 94105"
      .replace(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/g, "$1 [zip]")
  );
}
