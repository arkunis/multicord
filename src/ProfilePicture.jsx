import React,{useEffect,useState} from 'react';
export default function ProfilePicture({user,className='avatar',style,children}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[user?.avatar]);
 return <span className={`${className} profile-picture`} style={{background:user?.color||'#b9d8b2',...style}}>{user?.avatar&&!failed?<img src={user.avatar} alt="" onError={()=>setFailed(true)}/>:user?.username?.slice(0,2).toUpperCase()||'MC'}{children}</span>;
}
