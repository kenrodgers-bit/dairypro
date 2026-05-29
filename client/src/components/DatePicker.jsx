import React from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

export default function DatePicker({ value, onChange, className = 'input', ...props }) {
  const selected = value ? new Date(value) : null;

  return (
    <ReactDatePicker
      selected={Number.isNaN(selected?.getTime?.()) ? null : selected}
      onChange={(date) => onChange(date ? date.toISOString().slice(0, 10) : '')}
      dateFormat="yyyy-MM-dd"
      className={className}
      placeholderText="YYYY-MM-DD"
      {...props}
    />
  );
}
