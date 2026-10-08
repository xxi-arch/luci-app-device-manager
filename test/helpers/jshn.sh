# Test double for the standard jshn API. Records typed arguments, not plugin logic.
json_init() { printf 'init\0\0\0' > "$AUDIT_JSON_LOG"; }
json_add_boolean() { printf 'boolean\0%s\0%s\0' "$1" "$2" >> "$AUDIT_JSON_LOG"; }
json_add_string() { printf 'string\0%s\0%s\0' "$1" "$2" >> "$AUDIT_JSON_LOG"; }
json_add_array() { printf 'array\0%s\0\0' "$1" >> "$AUDIT_JSON_LOG"; }
json_add_object() { printf 'object\0%s\0\0' "$1" >> "$AUDIT_JSON_LOG"; }
json_close_array() { printf 'close\0\0\0' >> "$AUDIT_JSON_LOG"; }
json_close_object() { printf 'close\0\0\0' >> "$AUDIT_JSON_LOG"; }
json_dump() { "$AUDIT_NODE" "$AUDIT_JSON_ENCODER" "$AUDIT_JSON_LOG"; }
