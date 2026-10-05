import { useState } from 'react';

export default function useForm(initialValues = {}) {
  const [values, setValues] = useState(initialValues);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const reset = () => setValues(initialValues);

  return { values, setValues, handleChange, reset };
}
