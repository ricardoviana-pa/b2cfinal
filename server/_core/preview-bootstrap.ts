import "dotenv/config";
import { assertPreviewIsolation } from "../lib/preview-isolation";
// This must run before any provider/DB module captures environment credentials.
assertPreviewIsolation();
