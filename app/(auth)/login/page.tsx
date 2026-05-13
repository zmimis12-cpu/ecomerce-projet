export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <html>
      <body style={{margin:0,fontFamily:"sans-serif",background:"#f5f5f5",display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
        <div style={{background:"white",padding:"40px",borderRadius:"8px",boxShadow:"0 2px 10px rgba(0,0,0,0.1)",width:"100%",maxWidth:"400px"}}>
          <h1 style={{textAlign:"center",marginBottom:"24px",fontSize:"24px"}}>GestionPro</h1>
          <form method="POST" action="/api/auth/login">
            <div style={{marginBottom:"16px"}}>
              <label style={{display:"block",marginBottom:"6px",fontWeight:"500"}}>Email</label>
              <input name="email" type="email" required
                style={{width:"100%",padding:"10px",border:"1px solid #ddd",borderRadius:"6px",fontSize:"16px",boxSizing:"border-box"}} />
            </div>
            <div style={{marginBottom:"24px"}}>
              <label style={{display:"block",marginBottom:"6px",fontWeight:"500"}}>Mot de passe</label>
              <input name="password" type="password" required
                style={{width:"100%",padding:"10px",border:"1px solid #ddd",borderRadius:"6px",fontSize:"16px",boxSizing:"border-box"}} />
            </div>
            <button type="submit"
              style={{width:"100%",padding:"12px",background:"#000",color:"white",border:"none",borderRadius:"6px",fontSize:"16px",cursor:"pointer"}}>
              Se connecter
            </button>
          </form>
        </div>
      </body>
    </html>
  );
}
