import { Pipe, PipeTransform } from '@angular/core';

/** Põe a primeira letra em maiúscula (datas por extenso em pt-PT vêm em minúsculas). */
@Pipe({ name: 'cap' })
export class CapitalizePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }
}
