import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return {err:e};}
  render(){
    if(this.state.err) return (
      <div style={{padding:32,fontFamily:'Manrope,sans-serif',color:'#c0392b',background:'#fff5f5',minHeight:'100vh'}}>
        <h2>Noget gik galt</h2>
        <pre style={{whiteSpace:'pre-wrap',fontSize:13,background:'#fff',padding:16,border:'1px solid #fcc'}}>{this.state.err.message}{'\n'}{this.state.err.stack}</pre>
        <button onClick={()=>window.location.reload()} style={{marginTop:16,padding:'8px 16px',cursor:'pointer'}}>Genindlæs</button>
      </div>
    );
    return this.props.children;
  }
}

export default ErrorBoundary
