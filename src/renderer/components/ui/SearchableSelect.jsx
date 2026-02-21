import React, { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Type to search...',
  className = '',
  disabled = false
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef(null);

  const selectedLabel = useMemo(() => {
    const match = options.find((option) => String(option.value) === String(value));
    return match ? match.label : '';
  }, [options, value]);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return options;
    return options.filter((option) => option.label.toLowerCase().includes(text));
  }, [options, query]);

  const selectOption = (nextValue, nextLabel) => {
    onChange(nextValue);
    setQuery(nextLabel);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accentSoft disabled:cursor-not-allowed disabled:bg-muted/40"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);
          if (!nextQuery.trim()) onChange('');
        }}
        onBlur={() => {
          closeTimerRef.current = setTimeout(() => {
            setOpen(false);
            const exact = options.find(
              (option) => option.label.toLowerCase() === query.trim().toLowerCase()
            );
            if (exact) {
              setQuery(exact.label);
              onChange(exact.value);
            } else {
              setQuery(selectedLabel);
            }
          }, 120);
        }}
      />

      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-white shadow-lg">
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accentSoft"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option.value, option.label)}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted">No matches</p>
          )}
        </div>
      )}
    </div>
  );
}
