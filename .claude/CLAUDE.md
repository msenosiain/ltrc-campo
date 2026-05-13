# Stack del Proyecto

## Tecnologías
- **Frontend**: Angular 21 (standalone components, signals), Angular Material
- **Backend**: NestJS con Mongoose (MongoDB)
- **Base de datos**: MongoDB

## Convenciones
- Usar standalone components en Angular (NO NgModules)
- Usar `@if` / `@for` en lugar de `*ngIf` / `*ngFor`
- En NestJS: módulos por feature, DTOs con class-validator
- En MongoDB: Mongoose schemas con TypeScript interfaces

## Comandos comunes
- `ng serve` — levantar frontend
- `npm run start:dev` — levantar backend NestJS
- `ng generate component nombre --standalone` — nuevo componente

## Reglas
- Siempre usar Angular Material para UI, no CSS custom salvo casos justificados
- DTOs en NestJS deben tener validaciones con class-validator
- No usar `any` en TypeScript
- Siempre usar context7 para consultar documentación antes de generar código
  de Angular, NestJS, Mongoose o Angular Material
- **NUNCA hacer commit ni push sin que el usuario lo pida explícitamente** — cada push dispara un deploy automático en Render
