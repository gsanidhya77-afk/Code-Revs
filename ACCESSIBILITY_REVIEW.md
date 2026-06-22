# Accessibility Code Review: Multi-Format Data Import Pipeline

## Summary

This Python data import pipeline presents significant usability challenges for non-expert callers. Error messages lack actionable detail, warning/error semantics are confusing, and the public API conflates coercion warnings with validation errors—making it hard for integrators to surface meaningful feedback to end users. The pipeline also has critical silent failures and inconsistent error reporting that could hide data corruption. Three bugs create operational hazards: a loader crash in dry-run mode, a file handle leak, and JSON validation that only inspects the first record.

---

## Findings

### 1. Coercion Warnings Promoted to Row Errors (Semantic Confusion)

**Severity**: critical  
**Category**: blocker  
**File**: `importer/parsers.py:488-489`

**Issue**: In `SchemaValidator.validate_row()`, the line `errors: List[str] = list(warnings)` promotes all coercion warnings (e.g., "truncated float '3.14' to int") into the `ImportRow.errors` list. This makes **valid, coercible data** appear as **row failures**, poisoning the API contract.

**Impact on callers/users**:
- A CSV with INTEGER columns containing float values (e.g., `3.14`, `2.71`) will report "truncated float" as a row error, not a warning.
- `ImportResult.error_rows` will falsely include these rows, misleading the caller into thinking the data is invalid.
- Callers cannot distinguish between "data was coerced but usable" (warning) and "data failed validation" (error).
- End users will see misleading error messages claiming rows failed when they actually succeeded.

**Example**:
```python
# User has INTEGER schema but provides: 3.14
# Result: ImportRow(..., errors=["Column 'count': truncated float '3.14' to int"])
# Expected: errors=[] (valid), warnings included in result
```

**Fix**: Move coercion warnings to a separate `warnings` list on `ImportRow`. Return both from `validate_row()`, and only promote **true validation failures** (e.g., "cannot coerce") to errors.

```python
@dataclass
class ImportRow:
    row_number: int
    raw_data: dict
    parsed_data: dict
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)  # NEW
    
    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0  # warnings don't affect validity
```

Then in `validate_row()`:
```python
coerced, coercion_warnings = self.coerce_types(clean_row, schema)
warnings: List[str] = coercion_warnings  # Correct semantics
errors: List[str] = []

# Check required fields, patterns, etc. — only failures go to errors
```

---

### 2. Error Message Lacks Row Context & Actionable Guidance

**Severity**: high  
**Category**: should_fix  
**File**: `importer/parsers.py:500-505`

**Issue**: Error messages for validation failures are technically clear but omit critical context needed by callers to surface helpful feedback.

**Current message**:
```
"Column 'user_age': value length 5 exceeds max_length 3"
"Column 'email': value 'notanemail' does not match pattern '^[a-z]+@[a-z]+\.[a-z]{2,}$'"
```

**Missing context for non-experts**:
1. No indication of the value that failed (already shown for pattern mismatches, but not consistently).
2. For pattern failures, the pattern itself is too technical for end users—no human-readable explanation (e.g., "must be a valid email address").
3. No guidance on remediation ("expected format: city, state, zip").

**Impact on callers**:
- A non-technical integrator cannot easily explain to their end user what went wrong.
- Pattern errors surface raw regex, which is not user-friendly.
- Missing value display makes the error ambiguous ("which value?").

**Fix**: Enhance error messages with:
1. **Always include the actual value** (redacted for sensitive fields if needed).
2. **Human-readable pattern descriptions** in `ColumnSchema`:
   ```python
   @dataclass
   class ColumnSchema:
       name: str
       type: ColumnType
       pattern: Optional[str] = None
       pattern_description: Optional[str] = None  # e.g., "valid email address"
   ```
3. **Suggested fix** in error (if applicable):
   ```
   "Column 'user_age': '12345' exceeds max length (3 chars). Expected: 3 or fewer characters."
   "Column 'email': 'notanemail' is not a valid email address (expected: user@domain.com)."
   ```

---

### 3. Ambiguous ImportResult Error/Warning Semantics

**Severity**: high  
**Category**: should_fix  
**File**: `importer/models.py:70-77`

**Issue**: The `ImportResult` dataclass conflates two different failure signals:
- `errors: List[ImportRow]` — rows that failed validation.
- `warnings: List[str]` — unstructured strings (some are coercion warnings, some are load errors).

No documentation clarifies what belongs in each or how callers should interpret them.

**Current behavior** (from `pipeline.py:run()`):
```python
warnings.extend([w for w in import_row.errors if "cannot coerce" in w])
# ... later ...
if load_errors:
    warnings.extend(load_errors)  # Append batch loader errors as plain strings
```

**Impact on callers**:
- A caller iterating `result.warnings` gets a mixed bag: truncation notices, coercion failures, and batch-insert errors—no way to distinguish severity or actionability.
- Callers cannot programmatically route different warning types (e.g., log coercion notices, alert on batch failures).
- `errors` is always `List[ImportRow]`, but `warnings` is always `List[str]`—asymmetric design confuses integrators.

**Fix**: Introduce structured warning types:

```python
from enum import Enum
from dataclasses import dataclass

class WarningType(str, Enum):
    COERCION = "coercion"      # float truncated to int
    LOAD_BATCH_ERROR = "load_batch_error"
    ENCODING_ISSUE = "encoding_issue"

@dataclass
class ImportWarning:
    type: WarningType
    message: str
    row_number: Optional[int] = None  # row-specific warnings

@dataclass
class ImportResult:
    total_rows: int
    success_rows: int
    error_rows: int
    skipped_rows: int
    errors: List[ImportRow]
    warnings: List[ImportWarning]  # Structured
    duration_seconds: float
```

Document expected contents:
```python
class ImportResult:
    """
    Attributes:
        errors: Rows that failed validation (required fields, type coercion failure).
                Each ImportRow.errors contains field-level error messages.
        warnings: Non-fatal issues (coercion successes, batch insert warnings).
                  Includes WarningType enum for caller routing.
    """
```

---

### 4. JSON Parser Only Validates First Record (Silent Data Loss)

**Severity**: high  
**Category**: should_fix  
**File**: `importer/parsers.py:445-451`

**Issue**: `JsonParser.validate_structure()` checks for required columns only in the first JSON record:

```python
if data:
    sample_keys = {k.lower() for k in data[0].keys()}  # Only first record
    for col in schema.columns:
        if col.required and col.name.lower() not in sample_keys:
            errors.append(f"Required column '{col.name}' not found in first JSON record")
```

**Silent failure scenario**:
```json
[
  {"id": 1, "name": "Alice", "email": "alice@example.com"},
  {"id": 2, "name": "Bob"},  // Missing required 'email'
  {"id": 3, "name": "Charlie", "email": "charlie@example.com"}
]
```

With required schema `[id, name, email]`, the pipeline does **not** detect that record 2 is missing `email`. The row will be marked invalid during parsing, but the error message is unclear about why.

**Impact on callers**:
- Callers cannot trust that required-column checks caught all violations.
- Inconsistent structure across records is not explicitly signaled.
- "First record only" assumption is not documented, leading integrators to believe all records were validated.

**Fix**: Validate all records:

```python
def validate_structure(self, data: Any, schema: ImportSchema) -> List[str]:
    errors: List[str] = []
    if not isinstance(data, list):
        errors.append(f"JSON root must be an array, got {type(data).__name__}")
        return errors
    
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            errors.append(f"Element {idx} is not a JSON object: {type(item).__name__}")
        else:
            # Check every record, not just the first
            item_keys = {k.lower() for k in item.keys()}
            for col in schema.columns:
                if col.required and col.name.lower() not in item_keys:
                    errors.append(f"Element {idx}, required column '{col.name}' is missing")
    
    return errors
```

Or, document the first-record-only sampling as a **schema validation** step (separate from row parsing), and clearly state the assumption.

---

### 5. Loader Crash When None (Violates Documented Dry-Run Contract)

**Severity**: critical  
**Category**: blocker  
**File**: `importer/pipeline.py:152-154`

**Issue**: The `ImportPipeline.__init__()` docstring states:
```
loader: Object implementing bulk_insert(rows: List[dict]) -> None.
    Pass None for dry-run-only usage.
```

However, `run()` unconditionally calls `load_batch()` if `valid_rows` is non-empty:

```python
if valid_rows:  # BUG: does not check self.loader is not None
    batch_size = self.config.get("batch_size", _DEFAULT_BATCH_SIZE)
    loaded_count, load_errors = self.load_batch(valid_rows, batch_size=batch_size)
```

**Result**: Passing `loader=None` with a non-empty file will crash:
```
AttributeError: 'NoneType' object has no attribute 'bulk_insert'
```

**Impact on callers**:
- Dry-run usage (a documented feature) fails unexpectedly.
- The error occurs at runtime, not API setup time, making it hard to debug.
- Callers expecting dry-run to succeed will encounter crashes.

**Fix**: Check `self.loader` before calling `load_batch()`:

```python
loaded_count = 0
load_errors: List[str] = []

if self.loader is not None and valid_rows:
    batch_size = self.config.get("batch_size", _DEFAULT_BATCH_SIZE)
    loaded_count, load_errors = self.load_batch(valid_rows, batch_size=batch_size)
elif self.loader is None and valid_rows:
    # Dry run: count valid rows but don't insert
    loaded_count = len(valid_rows)

if load_errors:
    warnings.extend(load_errors)
```

Alternatively, raise a clear error at `__init__` time if `loader is None` but the config expects batch loading.

---

### 6. File Handle Leak in ExcelParser

**Severity**: high  
**Category**: should_fix  
**File**: `importer/parsers.py:285-286`

**Issue**: `ExcelParser.get_sheet_names()` opens a workbook but never closes it:

```python
def get_sheet_names(self, filepath: str) -> List[str]:
    try:
        import openpyxl
    except ImportError as exc:
        raise ImportError("openpyxl is required: pip install openpyxl") from exc
    wb = openpyxl.load_workbook(filepath, read_only=True)
    return wb.sheetnames  # Workbook never closed
```

**Impact on callers/operators**:
- Repeated calls to `get_sheet_names()` leak file handles.
- On systems with low file descriptor limits, this can exhaust the limit and cause crashes.
- Long-running import processes become unstable.

**Fix**: Use a context manager:

```python
def get_sheet_names(self, filepath: str) -> List[str]:
    try:
        import openpyxl
    except ImportError as exc:
        raise ImportError("openpyxl is required: pip install openpyxl") from exc
    with openpyxl.load_workbook(filepath, read_only=True) as wb:
        return wb.sheetnames
```

---

### 7. Unclear Distinction Between Required-Field & Type-Coercion Errors

**Severity**: medium  
**Category**: should_fix  
**File**: `importer/parsers.py:490-496`

**Issue**: Different error types are reported in the same list without any categorization:

```python
errors.append(f"Required column '{col_name}' is missing or empty")
errors.append(f"Column '{col.name}': value length {len(val)} exceeds max_length {col.max_length}")
errors.append(f"Column '{col.name}': value '{str_val}' does not match pattern '{col.pattern}'")
```

All three error types go into `ImportRow.errors`, but they represent different severity/remediation strategies:
1. **Missing required field** — row cannot be used; field must be populated.
2. **Max-length violation** — value is valid but truncation may be needed.
3. **Pattern mismatch** — value must be reformatted (e.g., phone number with dashes).

**Impact on callers**:
- Cannot easily route different error types (e.g., "missing required field" vs. "format issue").
- No way to auto-suggest remediation (e.g., "please provide phone number in (XXX) XXX-XXXX format").
- Callers building end-user error reports cannot prioritize by severity.

**Fix**: Introduce error categories within `ImportRow`:

```python
from enum import Enum
from dataclasses import dataclass

class RowErrorCategory(str, Enum):
    REQUIRED_MISSING = "required_missing"
    TYPE_COERCION_FAILURE = "type_coercion_failure"
    LENGTH_VIOLATION = "length_violation"
    PATTERN_VIOLATION = "pattern_violation"

@dataclass
class RowError:
    category: RowErrorCategory
    column_name: str
    message: str
    value: Optional[str] = None  # The value that failed

@dataclass
class ImportRow:
    row_number: int
    raw_data: dict
    parsed_data: dict
    errors: List[RowError] = field(default_factory=list)
    
    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0
```

Then in validation:
```python
if val is None or (isinstance(val, str) and val.strip() == ""):
    errors.append(RowError(
        category=RowErrorCategory.REQUIRED_MISSING,
        column_name=col_name,
        message=f"Required column '{col_name}' is missing or empty"
    ))
```

---

### 8. Missing Documentation on Encoding Handling & Edge Cases

**Severity**: medium  
**Category**: suggestion  
**File**: `importer/models.py:46`, `importer/pipeline.py` (general)

**Issue**: The `ImportSchema.encoding` field defaults to `"utf-8"`, but there is no documented behavior for:
1. What happens when the actual file encoding differs from the declared schema encoding?
2. How BOM (Byte Order Mark) is handled?
3. Whether encoding errors are logged, skipped, or reported?
4. How non-UTF-8 files (e.g., Latin-1, Windows-1252) are detected or handled?

**Current code provides no encoding-detection logic**, and the pipeline does not expose encoding errors to callers.

**Impact on callers**:
- Non-expert integrators may provide files with wrong encodings and get silent failures.
- CSV/Excel files from Windows often use Windows-1252; no guidance on how to detect or configure this.
- Operators in non-English-speaking regions may encounter encoding issues with no insight.

**Fix**: Document encoding handling and add detection/error reporting:

```python
@dataclass
class ImportSchema:
    """
    Attributes:
        encoding: Expected file encoding (default: "utf-8").
                 If the actual file encoding differs, parsing may fail or produce garbled text.
                 Common non-UTF-8 encodings:
                 - "windows-1252": Windows-produced CSVs/Excel
                 - "iso-8859-1": Legacy European files
                 - "cp1252": Windows Central European
    """
    encoding: str = "utf-8"

class ImportPipeline:
    def run(self, filepath: str, format: Optional[FileFormat] = None) -> ImportResult:
        """
        Behavior on encoding errors:
        - If a row contains characters that cannot be decoded with the specified encoding,
          an ImportWarning(type=ENCODING_ISSUE, ...) is added and the row is skipped.
        - Recommend caller inspect ImportResult.warnings for encoding issues.
        """
```

Add encoding validation/detection as an optional pre-flight check:
```python
def detect_encoding(filepath: str) -> str:
    """Detect file encoding using chardet (optional dependency)."""
    # Implementation using chardet or similar
    pass
```

Document in the integration guide that encoding mismatches are a common source of silent data loss.

---

## Summary of Recommended Priority Fixes

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0 (Critical)** | Loader crash when `loader=None` (Finding 5) | Dry-run feature broken |
| **P0 (Critical)** | Coercion warnings promoted to errors (Finding 1) | Invalid data marked as valid, or valid data marked invalid |
| **P1 (High)** | JSON first-record-only validation (Finding 4) | Silent data loss; required-field checks unreliable |
| **P1 (High)** | Error messages lack context & remediation (Finding 2) | Integrators cannot surface useful end-user feedback |
| **P1 (High)** | File handle leak in ExcelParser (Finding 6) | Long-running imports fail; resource exhaustion |
| **P2 (Medium)** | Ambiguous error/warning semantics (Finding 3) | Integrators cannot distinguish failure types |
| **P2 (Medium)** | Unclear error categories (Finding 7) | Cannot auto-route or prioritize errors |
| **P3 (Low)** | Missing encoding documentation (Finding 8) | Non-experts encounter silent encoding failures |

---

## Conclusion

This pipeline has solid type definitions and a clear overall structure, but suffers from usability gaps that will frustrate non-expert integrators and end users. The three critical bugs (loader crash, coercion semantics, file handle leak) must be fixed before release. The high-priority findings (error clarity, JSON validation, structured warnings) require API redesign to meet the standard of a library intended for external use.

**Key recommendation**: Before release, introduce structured error/warning types and validate the entire error/warning flow end-to-end, ensuring that a non-technical integrator can understand and relay meaningful feedback to their end users.
