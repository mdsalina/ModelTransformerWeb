# ModelTransformerWeb - Contexto para Agentes de IA

Este archivo sirve como guía y documentación técnica para que cualquier agente de IA pueda entender rápidamente la estructura, funcionamiento y arquitectura del proyecto frontend **ModelTransformerWeb (MTWeb)**, así como su integración con el backend y el agente local de ETABS.

---

## 🏗️ Descripción General y Flujo de Trabajo

El ecosistema **Mtransformer** permite tomar datos geométricos estructurales exportados de Autodesk Revit en formato JSON, optimizarlos/filtrarlos a nivel geométrico y analítico, y finalmente modelarlos de forma automática en CSI ETABS a través de su API COM.

Este repositorio, `MTWeb`, es el frontend web de la aplicación. Guía al usuario a través de un asistente de 5 pasos:
1. **Login (`login`)**: Acceso simulado de usuario ([LoginScreen.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/LoginScreen.tsx)).
2. **Cargar Archivo (`upload`)**: Carga de un archivo `.json` que contiene la estructura BIM exportada de Revit ([UploadStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/UploadStep.tsx)).
3. **Filtros (`filters`)**: Filtrado del modelo original según elementos (muros, vigas, losas, grillas), niveles, secciones y rangos de espesor ([FiltersStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/FiltersStep.tsx)).
4. **Procesar (`process`)**: Configuración de tolerancias y parámetros geométricos para optimizar el modelo enviándolo al backend ([ProcessStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/ProcessStep.tsx)).
5. **Exportar (`export`)**: Descarga del archivo final en formato JSON/RVT o inyección automatizada al programa ETABS abierto localmente mediante un agente loopback ([ExportStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/ExportStep.tsx)).

---

## 🔌 Ecosistema y Servicios Relacionados

Para que la aplicación funcione en su totalidad, interactúa con dos servicios backend locales:

1. **Servidor Backend de Optimización (`Revit2Etabs`)**:
   - **Dirección**: `http://127.0.0.1:8000`
   - **Endpoint Principal**: `/procesar` (POST)
   - **Función**: Recibe el modelo filtrado y los parámetros geométricos, procesa la geometría con Shapely, realiza optimizaciones topológicas (snapping de nodos, detección de ángulos mediante DBSCAN), y retorna el modelo optimizado.
   - **Código fuente principal**: Ubicado en el directorio hermano [Revit2Etabs](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/Revit2Etabs).

2. **Agente de Loopback Local (`ConectorMT`)**:
   - **Dirección**: `http://127.0.0.1:18290`
   - **Endpoints Principales**:
     - `/api/connect` (POST): Verifica la conexión con una instancia activa de CSI ETABS en la máquina del usuario.
     - `/api/modelar` (POST): Recibe el JSON del modelo procesado y los parámetros de exportación para dibujar la estructura en ETABS automáticamente.
   - **Código fuente principal**: Ubicado en el directorio hermano [ConectorMT](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/ConectorMT).

---

## 📂 Estructura de Directorios (MTWeb)

- **`index.html`**: Punto de entrada HTML.
- **`src/`**:
  - **[main.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/main.tsx)**: Renderiza el componente raíz `App`.
  - **[App.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/App.tsx)**: Renderiza el contenedor principal `BimModelTransformer`.
  - **`components/`**:
    - **[BimModelTransformer.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/BimModelTransformer.tsx)**: Coordinador del estado global del asistente (pasos, archivos, filtros, parámetros).
    - **[LoginScreen.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/LoginScreen.tsx)**: Pantalla de inicio de sesión.
    - **[UploadStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/UploadStep.tsx)**: Validador y cargador del JSON del modelo.
    - **[FiltersStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/FiltersStep.tsx)**: Controles de selección de niveles, espesores y categorías.
    - **[ProcessStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/ProcessStep.tsx)**: Configuración geométrica y comunicación con la API de optimización.
    - **[ExportStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/ExportStep.tsx)**: Opciones de formato de exportación (.rvt, .edb), estado del proceso y comunicación con el Agente Loopback local.
    - **[ThreeViewport.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/ThreeViewport.tsx)**: Visor 3D interactivo desarrollado con Three.js que dibuja grillas, vigas, losas, muros y columnas dinámicamente.
    - **[Icons.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/Icons.tsx)**: Biblioteca interna de iconos SVG.
  - **`types/`**:
    - **[index.ts](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/types/index.ts)**: Contiene todas las interfaces TypeScript (modelos de datos JSON, estados de filtros, parámetros de procesamiento, etc.).
  - **`assets/`**: Contiene logos o imágenes estáticas.
  - **`index.css`**: Define los estilos globales y clases CSS personalizadas para el tema visual premium.

---

## ⚙️ Configuración y Mecánicas Críticas

### 1. Modelo Original vs Procesado
El estado en [BimModelTransformer.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/BimModelTransformer.tsx) mantiene las variables:
- `originalModel`: Los datos tal cual se cargaron desde el archivo JSON de Revit.
- `processedModel`: Los datos optimizados devueltos por el backend tras presionar "Optimizar".
- `activeModelType` (`'original' | 'processed'`): Determina cuál de los dos modelos está activo y se renderiza.
- `modelData`: El modelo activo actualmente (el que lee el visor 3D y los filtros).

Cuando el usuario cambia de modelo activo mediante la interfaz de pestañas, el visor 3D se actualiza automáticamente y los filtros dinámicos se recalculan preservando la selección del usuario.

### 2. Parámetros de Exportación de ETABS
Al seleccionar el formato `.EDB` en la pantalla de exportación ([ExportStep.tsx](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb/src/components/ExportStep.tsx)), se presentan dos opciones específicas:
- **Exportar Materiales** (`exportMaterials`): Booleano que determina si se crean los materiales estructurales del modelo en ETABS.
- **Modificar Nombre Secciones** (`modifySectionNames`): Booleano que simplifica los nombres de las secciones para cumplir con convenciones analíticas estándar.
Estos valores se envían como parte del cuerpo de la petición POST a `http://127.0.0.1:18290/api/modelar`.

---

## 🛠️ Comandos de Desarrollo

En la raíz del proyecto ([MTWeb](file:///c:/Users/mdsalina/Proyectos/Otros/Programas/Python/Mtransformer/MTWeb)), puedes ejecutar:

- **Iniciar en modo desarrollo**:
  ```bash
  npm run dev
  ```
  Inicia el servidor local de Vite en `http://localhost:5173`.

- **Compilar para producción**:
  ```bash
  npm run build
  ```
  Genera los archivos compilados y minificados en el directorio `/dist`.

- **Analizar código (ESLint)**:
  ```bash
  npm run lint
  ```
  Ejecuta el linter en busca de problemas de formato o calidad de código.
