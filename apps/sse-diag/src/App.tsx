import MolstarSseDiagViewer from './components/MolstarSseDiagViewer';

export default function App() {
  return (
    <>
      <MolstarSseDiagViewer />
      <pre
        id="fatal"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          margin: 0,
          padding: 8,
          maxHeight: '35vh',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          background: '#fee',
          color: '#900',
          fontSize: 12,
          zIndex: 99999,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
