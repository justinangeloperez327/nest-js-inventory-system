import type { ValidationError } from 'class-validator';
import { describe, expect, it } from '@jest/globals';

import { validationErrorsToFields } from './validation-errors.util.js';

describe('validationErrorsToFields', () => {
  it('flattens nested validation errors into dotted field paths', () => {
    const errors: ValidationError[] = [
      {
        property: 'email',
        constraints: {
          isEmail: 'email must be an email',
        },
        children: [],
      },
      {
        property: 'lines',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'quantity',
                constraints: {
                  min: 'quantity must not be less than 1',
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    expect(validationErrorsToFields(errors)).toEqual({
      email: ['email must be an email'],
      'lines.0.quantity': ['quantity must not be less than 1'],
    });
  });
});
